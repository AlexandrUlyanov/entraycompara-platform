import importlib
import os
import sys
import types
import unittest


def install_dependency_stubs():
    class FakeHTTPException(Exception):
        def __init__(self, status_code=None, detail=None):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class FakeFastAPI:
        def add_middleware(self, *args, **kwargs):
            return None

        def get(self, *args, **kwargs):
            return lambda fn: fn

        def post(self, *args, **kwargs):
            return lambda fn: fn

        def put(self, *args, **kwargs):
            return lambda fn: fn

        def delete(self, *args, **kwargs):
            return lambda fn: fn

    def passthrough_default(default=None, *args, **kwargs):
        return default

    fastapi = types.ModuleType("fastapi")
    fastapi.FastAPI = FakeFastAPI
    fastapi.File = passthrough_default
    fastapi.UploadFile = object
    fastapi.HTTPException = FakeHTTPException
    fastapi.Form = passthrough_default
    fastapi.Depends = passthrough_default
    fastapi.Query = passthrough_default
    fastapi.Header = passthrough_default
    fastapi.Body = passthrough_default
    fastapi.status = types.SimpleNamespace(
        HTTP_201_CREATED=201,
        HTTP_204_NO_CONTENT=204,
        HTTP_400_BAD_REQUEST=400,
        HTTP_401_UNAUTHORIZED=401,
        HTTP_404_NOT_FOUND=404,
        HTTP_500_INTERNAL_SERVER_ERROR=500,
    )

    fastapi_middleware = types.ModuleType("fastapi.middleware")
    fastapi_cors = types.ModuleType("fastapi.middleware.cors")
    fastapi_cors.CORSMiddleware = object

    class FakeBaseModel:
        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = FakeBaseModel

    class FakeClient:
        def __getattr__(self, name):
            def method(*args, **kwargs):
                return self
            return method

    storage = types.ModuleType("google.cloud.storage")
    storage.Client = FakeClient

    firestore = types.ModuleType("google.cloud.firestore")
    firestore.Client = FakeClient
    firestore.Query = types.SimpleNamespace(DESCENDING="DESCENDING")
    firestore.DocumentSnapshot = object

    google = types.ModuleType("google")
    cloud = types.ModuleType("google.cloud")
    cloud.storage = storage
    cloud.firestore = firestore
    generativeai = types.ModuleType("google.generativeai")
    generativeai.configure = lambda *args, **kwargs: None

    stdnum = types.ModuleType("stdnum")
    stdnum_es = types.ModuleType("stdnum.es")
    stdnum_cups = types.ModuleType("stdnum.es.cups")

    sys.modules.update({
        "fastapi": fastapi,
        "fastapi.middleware": fastapi_middleware,
        "fastapi.middleware.cors": fastapi_cors,
        "pydantic": pydantic,
        "google": google,
        "google.cloud": cloud,
        "google.cloud.storage": storage,
        "google.cloud.firestore": firestore,
        "google.generativeai": generativeai,
        "stdnum": stdnum,
        "stdnum.es": stdnum_es,
        "stdnum.es.cups": stdnum_cups,
        "eni_simulator": types.ModuleType("eni_simulator"),
    })


def load_main():
    install_dependency_stubs()
    service_dir = os.path.dirname(os.path.dirname(__file__))
    if service_dir not in sys.path:
        sys.path.insert(0, service_dir)
    sys.modules.pop("main", None)
    return importlib.import_module("main")


class SalesDepartmentGuardrailTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main = load_main()

    def test_message_guardrails_block_unsafe_sales_language(self):
        result = self.main.evaluate_sales_message_guardrails(
            "Solo hoy garantizamos el ahorro. CRM pipeline: envíenos la factura?",
            expected_language="es",
        )

        self.assertFalse(result["safe_to_execute"])
        self.assertIn("guaranteed_savings_claim", result["blocked_reasons"])
        self.assertIn("false_urgency", result["blocked_reasons"])
        self.assertIn("internal_context_exposed", result["blocked_reasons"])

    def test_message_guardrails_detect_language_mismatch(self):
        result = self.main.evaluate_sales_message_guardrails(
            "Здравствуйте, мы уже проверяем ваш счёт.",
            expected_language="es",
        )

        self.assertFalse(result["safe_to_execute"])
        self.assertIn("language_mismatch", result["blocked_reasons"])

    def test_action_guardrails_do_not_request_existing_documents(self):
        snapshot = {
            "signals": {"has_files": True, "has_proposal": False, "has_selected_simulation": False},
            "lead": {"uploaded_files_count": 1, "language": "es"},
        }
        action = {"type": self.main.SalesActionType.REQUEST_INVOICE.value}

        result = self.main.evaluate_sales_guardrails(
            snapshot,
            action,
            "Puede enviarnos su factura?",
            {"language_used": "es", "reply_probability": 0.7},
        )

        self.assertFalse(result["safe_to_execute"])
        self.assertIn("would_request_existing_documents", result["blocked_reasons"])

    def test_prepare_proposal_requires_selected_simulation(self):
        snapshot = {
            "signals": {"has_files": True, "has_proposal": False, "has_selected_simulation": False},
            "lead": {"uploaded_files_count": 1, "language": "es"},
        }
        action = {"type": self.main.SalesActionType.GENERATE_PROPOSAL.value}

        result = self.main.evaluate_sales_guardrails(snapshot, action, "Estamos preparando la propuesta.", {})

        self.assertFalse(result["safe_to_execute"])
        self.assertIn("selected_simulation_missing", result["blocked_reasons"])

    def test_recommended_action_mapping_respects_proposal_state(self):
        self.assertEqual(
            self.main.map_recommended_action_to_sales_action_type(
                "prepare_and_send_proposal",
                {"has_proposal": False},
            ),
            self.main.SalesActionType.GENERATE_PROPOSAL.value,
        )
        self.assertEqual(
            self.main.map_recommended_action_to_sales_action_type(
                "prepare_and_send_proposal",
                {"has_proposal": True},
            ),
            self.main.SalesActionType.SEND_PROPOSAL.value,
        )


class SalesDepartmentAutopilotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main = load_main()

    def setUp(self):
        self.main.SALES_DEPARTMENT_AUTOMATION_ENABLED = True

    def test_full_auto_is_locked(self):
        state = {
            "reply_probability": 0.8,
            "pipeline_health": "healthy",
            "recommended_action": "confirm_next_steps",
            "snapshot_summary": {"uploaded_files_count": 1},
            "guardrail_result": {"requires_operator_approval": True},
        }

        result = self.main.evaluate_autopilot_control("app1", self.main.AutopilotMode.FULL_AUTO.value, True, state)

        self.assertFalse(result["safe_to_send"])
        self.assertIn("full_auto_locked_until_guardrails", result["blocked_reasons"])

    def test_kill_switch_blocks_automation_modes(self):
        self.main.SALES_DEPARTMENT_AUTOMATION_ENABLED = False
        state = {
            "reply_probability": 0.8,
            "pipeline_health": "healthy",
            "recommended_action": "confirm_next_steps",
            "snapshot_summary": {"uploaded_files_count": 1},
            "guardrail_result": {"requires_operator_approval": False},
        }

        result = self.main.evaluate_autopilot_control("app1", self.main.AutopilotMode.ASSISTED_AUTO.value, True, state)

        self.assertFalse(result["enabled"])
        self.assertFalse(result["safe_to_send"])
        self.assertIn("sales_automation_disabled", result["blocked_reasons"])


if __name__ == "__main__":
    unittest.main()
