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
    fastapi.Request = object
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


class PostSubmitSecurityHelperTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.main = load_main()

    def test_verification_code_generation_and_formatting(self):
        code = self.main.generate_verification_code()

        self.assertRegex(code, r"^\d{6}$")
        self.assertEqual(self.main.format_verification_code("739284"), "739 284")

    def test_client_secret_hash_does_not_store_plaintext(self):
        value = "739284"
        hashed = self.main.hash_client_secret(value)

        self.assertNotEqual(hashed, value)
        self.assertEqual(hashed, self.main.hash_client_secret(value))
        self.assertRegex(hashed, r"^[a-f0-9]{64}$")

    def test_parse_whatsapp_activation_text(self):
        parsed = self.main.parse_whatsapp_activation_text(
            "Hola, soy cliente de Entra y Compara. Mi código es EC-482913 / 739284."
        )

        self.assertEqual(parsed, ("EC-482913", "739284"))

    def test_verification_attempt_window_limits_short_bursts(self):
        now = self.main.datetime.datetime(2026, 5, 1, 12, 0, 0)
        app_data = {
            "verification_code_attempt_window_started_at": now - self.main.datetime.timedelta(seconds=30),
            "verification_code_attempt_window_count": 4,
        }

        window_started_at, window_count = self.main.get_verification_attempt_window(app_data, now)
        update = self.main.build_verification_attempt_update(2, window_started_at, window_count, now)

        self.assertEqual(window_count, 4)
        self.assertEqual(update["verification_code_attempts"], 3)
        self.assertEqual(update["verification_code_attempt_window_count"], 5)

    def test_verification_attempt_window_resets_after_timeout(self):
        now = self.main.datetime.datetime(2026, 5, 1, 12, 0, 0)
        app_data = {
            "verification_code_attempt_window_started_at": now - self.main.datetime.timedelta(seconds=120),
            "verification_code_attempt_window_count": 5,
        }

        window_started_at, window_count = self.main.get_verification_attempt_window(app_data, now)

        self.assertEqual(window_started_at, now)
        self.assertEqual(window_count, 0)

    def test_meta_signature_validation(self):
        raw_body = b'{"entry":[]}'
        self.main.WHATSAPP_APP_SECRET = "test-secret"
        signature = self.main.hmac.new(
            b"test-secret",
            raw_body,
            self.main.hashlib.sha256,
        ).hexdigest()

        self.assertTrue(self.main.verify_meta_signature(raw_body, f"sha256={signature}"))
        self.assertFalse(self.main.verify_meta_signature(raw_body, "sha256=bad"))


if __name__ == "__main__":
    unittest.main()
