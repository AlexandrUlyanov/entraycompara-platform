
import React, { useState, useRef, useEffect } from 'react';
import { WhatsAppIcon, CloudArrowUpIcon, DocumentIcon, XCircleIcon, UserIconGeneric, BoltIcon, DocumentArrowUpIcon, UsersIconHero, FireIcon, WifiIcon, DevicePhoneMobileIcon } from './Icons.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

interface FileUploadFormProps {
  buttonText?: string;
  formTitle?: string;
  idSuffix: string;
}

const FileUploadForm: React.FC<FileUploadFormProps> = ({
  buttonText,
  formTitle,
  idSuffix
}) => {
  const { t } = useLanguage();
  
  const [name, setName] = useState('');
  const [phoneNumberSuffix, setPhoneNumberSuffix] = useState('');
  const [email, setEmail] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPhoneEntered, setIsPhoneEntered] = useState(false);
  const [prefersWhatsApp, setPrefersWhatsApp] = useState(true); 
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const nameInputId = `name-${idSuffix}`;
  const phoneInputId = `phone-${idSuffix}`;
  const whatsAppCheckboxId = `whatsapp-checkbox-${idSuffix}`;
  const emailInputId = `email-${idSuffix}`;
  const fileUploadInputId = `file-upload-${idSuffix}`;

  const backendUrl = 'https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/submit_application';

  // Determine button text based on state
  const baseButtonText = buttonText || t('fileUploadForm.submit_button_text');
  const readyToSendText = t('fileUploadForm.submit_button_text_ready');
  const displayButtonText = files.length > 0 ? readyToSendText : baseButtonText;

  const defaultFormTitle = formTitle || t('fileUploadForm.dropzone_title');

  const trustBenefits = [
    { icon: <BoltIcon className="w-4 h-4 text-primary" />, text: t('hero.benefit1') },
    { icon: <DocumentArrowUpIcon className="w-4 h-4 text-primary" />, text: t('hero.benefit2') },
    { icon: <UsersIconHero className="w-4 h-4 text-primary" />, text: t('hero.benefit3') },
  ];

  const services = [
    { 
      icon: <BoltIcon className="w-4 h-4" />, 
      label: t('services.electricity', { _default: 'Luz' }), 
      color: 'text-amber-500', 
      bg: 'bg-amber-50',
      borderColor: 'border-amber-100',
      delay: '0ms'
    },
    { 
      icon: <FireIcon className="w-4 h-4" />, 
      label: t('services.gas', { _default: 'Gas' }), 
      color: 'text-orange-500', 
      bg: 'bg-orange-50',
      borderColor: 'border-orange-100',
      delay: '100ms'
    },
    { 
      icon: <DevicePhoneMobileIcon className="w-4 h-4" />, 
      label: t('services.phone', { _default: 'Móvil' }), 
      color: 'text-blue-500', 
      bg: 'bg-blue-50',
      borderColor: 'border-blue-100',
      delay: '200ms'
    },
    { 
      icon: <WifiIcon className="w-4 h-4" />, 
      label: t('services.internet', { _default: 'Internet' }), 
      color: 'text-indigo-500', 
      bg: 'bg-indigo-50',
      borderColor: 'border-indigo-100',
      delay: '300ms'
    },
  ];

  const formatPhoneNumberSuffixForDisplay = (digits: string): string => {
    const cleaned = digits.replace(/\D/g, '').slice(0, 9);
    const parts = [];
    if (cleaned.length > 0) parts.push(cleaned.substring(0, 3));
    if (cleaned.length > 3) parts.push(cleaned.substring(3, 6));
    if (cleaned.length > 6) parts.push(cleaned.substring(6, 9));
    return parts.join(' ');
  };

  // Helper to strictly truncate filename for display to prevent layout breaking
  const truncateFilename = (filename: string, maxLength: number = 22) => {
    if (filename.length <= maxLength) return filename;
    const parts = filename.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';
    const name = parts.join('.');
    
    if (ext.length > 5 || !ext) {
        return filename.substring(0, maxLength - 3) + '...';
    }
    
    const charsToShow = maxLength - (ext.length + 1) - 3; 
    if (charsToShow < 2) return filename.substring(0, maxLength - 3) + '...';

    const frontChars = Math.ceil(charsToShow / 2);
    const backChars = Math.floor(charsToShow / 2);

    return `${name.substring(0, frontChars)}...${name.substring(name.length - backChars)}.${ext}`;
  };
  
  useEffect(() => {
    const cleanedSuffix = phoneNumberSuffix.replace(/\D/g, '');
    if (cleanedSuffix.length > 0) {
      setIsPhoneEntered(true);
    } else {
      setIsPhoneEntered(false);
      setPrefersWhatsApp(true); 
      setEmail(''); 
    }
  }, [phoneNumberSuffix]); 
  
  const showConditionalFields = files.length > 0;
  const showWhatsAppOption = isPhoneEntered && showConditionalFields;
  const showEmailField = isPhoneEntered && !prefersWhatsApp && showConditionalFields;
  const isEmailActuallyRequired = showEmailField;

  const processFileList = (incomingFiles: FileList | null) => {
    if (!incomingFiles || incomingFiles.length === 0) return;

    const selectedFiles = Array.from(incomingFiles);
    const validNewFiles: File[] = [];
    let sizeErrorFound = false;
    let firstInvalidFileName = "";

    selectedFiles.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        sizeErrorFound = true;
        if (!firstInvalidFileName) firstInvalidFileName = file.name;
      } else {
        validNewFiles.push(file);
      }
    });

    if (validNewFiles.length > 0) {
      setFiles(prevFiles => {
        const combined = [...prevFiles, ...validNewFiles];
        return combined.filter((file, index, self) =>
          index === self.findIndex((f) => (
            f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
          ))
        );
      });
    }

    if (sizeErrorFound) {
      setSubmitMessage(t('fileUploadForm.error_file_too_large', { fileName: firstInvalidFileName }));
    } else if (validNewFiles.length > 0) {
       setSubmitMessage(null); 
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    processFileList(event.target.files);
    if (fileInputRef.current) {
      setTimeout(() => {
          if(fileInputRef.current) fileInputRef.current.value = '';
      }, 0);
    }
  };

  const handleRemoveFile = (fileToRemove: File) => {
    setFiles(prevFiles => {
      const updatedFiles = prevFiles.filter(f => f !== fileToRemove);
      if (updatedFiles.length === 0) {
        setName('');
        setPhoneNumberSuffix('');
        setEmail('');
        setIsPhoneEntered(false);
        setPrefersWhatsApp(true);
        setSubmitMessage(null);
      }
      return updatedFiles;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitMessage(null);

    if (files.length === 0) {
      setSubmitMessage(t('fileUploadForm.error_no_file'));
      return;
    }
    
    if (!name.trim()) {
      setSubmitMessage(t('fileUploadForm.error_name_required'));
      return;
    }
    
    const cleanedSuffix = phoneNumberSuffix.replace(/\D/g, '');

    if (cleanedSuffix.length === 0) {
        setSubmitMessage(t('fileUploadForm.error_phone_required'));
        return;
    }

    if (cleanedSuffix.length !== 9) { 
        setSubmitMessage(t('fileUploadForm.error_invalid_phone'));
        return;
    }
    
    if (isEmailActuallyRequired && !email.trim()) {
        setSubmitMessage(t('fileUploadForm.error_no_email'));
        return;
    }

    setIsSubmitting(true);
    setSubmitMessage(t('fileUploadForm.status_processing'));

    const formData = new FormData();
    const fullPhoneNumber = `+34${cleanedSuffix}`;

    formData.append('client_name', name);
    formData.append('client_phone', fullPhoneNumber);
    formData.append('client_email', showEmailField ? email : '');
    formData.append('service_type', 'GasComparison');
    formData.append('notes', '');
    
    files.forEach((file) => {
      formData.append('invoiceFiles', file, file.name);
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(backendUrl, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorPayloadMessage = `Error del servidor: ${response.status} ${response.statusText}`;
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            const errorData = await response.json();
            errorPayloadMessage = errorData.error || errorData.message || JSON.stringify(errorData);
          } else {
            const textError = await response.text();
            errorPayloadMessage = textError.length < 300 ? textError : t('fileUploadForm.error_server', { status: response.status });
          }
        } catch (e) {
          console.error("Fallo al parsear el cuerpo de la respuesta de error:", e);
        }
        throw new Error(errorPayloadMessage);
      }
      
      await response.json(); 
      
      let successMsg = t('fileUploadForm.success_message');
      
      if (!showEmailField) { 
          successMsg += ` ${t('fileUploadForm.success_message_phone')}`;
      }
      setSubmitMessage(successMsg);

      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setName('');
      setPhoneNumberSuffix('');
      setEmail('');
      setIsPhoneEntered(false);
      setPrefersWhatsApp(true);
      
    } catch (error: any) {
        let displayMessage;
        if (error.name === 'AbortError' || (error instanceof Error && error.message.toLowerCase().includes('aborted'))) {
            displayMessage = t('fileUploadForm.error_timeout');
        } else if (error instanceof Error) {
            if (error.message.toLowerCase().includes("failed to fetch")) {
                displayMessage = t('fileUploadForm.error_network');
            } else if (!error.message.toLowerCase().startsWith('error:')) {
                displayMessage = `Error: ${error.message}`;
            } else {
                displayMessage = error.message;
            }
        } else {
            displayMessage = t('fileUploadForm.error_generic');
        }
        setSubmitMessage(displayMessage);
    } finally {
        clearTimeout(timeoutId);
        setIsSubmitting(false);
    }
  };

  const whatsappNumber = "34611974984"; 
  const whatsappMessage = encodeURIComponent(t('fileUploadForm.whatsapp_default_message', { _default: "Hola, quiero enviar mi factura para un análisis de ahorro gratuito." }));

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const dropzone = e.currentTarget;
    if (!dropzone.contains(e.relatedTarget as Node)) {
        setIsDraggingOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    processFileList(e.dataTransfer.files);
    if (e.dataTransfer.items) {
      e.dataTransfer.items.clear();
    } else {
      e.dataTransfer.clearData();
    }
  };

  useEffect(() => {
    const handleTriggerUpload = () => {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    };
    window.addEventListener('trigger-hero-file-upload', handleTriggerUpload);
    return () => {
      window.removeEventListener('trigger-hero-file-upload', handleTriggerUpload);
    };
  }, []);

  return (
    <div className="bg-white p-8 md:p-10 rounded-[30px] shadow-apple w-full mx-auto relative transition-all duration-500 hover:shadow-apple-hover">
      
      {/* Services Badges - Animated */}
      <div className="flex justify-center flex-wrap gap-2 sm:gap-3 mb-8">
        {services.map((s, idx) => (
          <div 
            key={idx}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border ${s.borderColor} ${s.bg} animate-fadeInUp shadow-sm`}
            style={{ animationDelay: s.delay, animationFillMode: 'both' }}
          >
            <span className={s.color}>{s.icon}</span>
            <span className="text-xs font-semibold text-secondary-DEFAULT tracking-tight">{s.label}</span>
          </div>
        ))}
      </div>

           
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <div>
          <label
            htmlFor={fileUploadInputId}
            className={`block border-2 border-dashed rounded-[20px] p-8 text-center cursor-pointer transition-all duration-300 ease-out group ${
                isDraggingOver 
                ? 'border-primary bg-primary/5 scale-[1.02]' 
                : files.length === 0 
                  ? 'animate-border-breathe hover:border-primary hover:bg-slate-50 hover:shadow-sm'
                  : 'border-slate-200 hover:border-primary hover:bg-slate-50 hover:shadow-sm'
            }`}
            onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          >
            <div className="transition-transform duration-300 group-hover:scale-110 group-hover:-translate-y-1">
               <CloudArrowUpIcon className={`w-12 h-12 mx-auto mb-4 transition-colors ${isDraggingOver ? 'text-primary' : 'text-slate-400'} animate-pulse-subtle`} />
            </div>
            <p className="text-secondary text-lg mb-4 font-medium transition-colors group-hover:text-primary">
              {files.length > 0 ? t('fileUploadForm.dropzone_files_selected', { count: files.length }) : defaultFormTitle}
            </p>
            <span
              role="button" tabIndex={isSubmitting ? -1 : 0} aria-disabled={isSubmitting}
              onClick={(e) => { if (isSubmitting) e.preventDefault(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isSubmitting && fileInputRef.current) { fileInputRef.current.click(); } e.stopPropagation(); }}}
              className={`inline-block py-3 px-8 rounded-full text-base font-bold transition-all duration-300 active:scale-95 ${
                  isSubmitting 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                    : files.length === 0
                       ? 'bg-primary text-white hover:bg-primary-dark shadow-lg hover:shadow-primary/40 animate-cta-attention'
                       : 'bg-primary text-white group-hover:bg-primary-dark shadow-sm'
                  }`}
            >
              {t('fileUploadForm.dropzone_select_files')}
            </span>
            <p className="text-secondary-light text-xs mt-4">{t('fileUploadForm.dropzone_supported_formats')}</p>
          </label>
          <input
            type="file" name="invoiceFile" id={fileUploadInputId} ref={fileInputRef} onChange={handleFileChange}
            multiple required={files.length === 0} aria-required={files.length === 0} className="sr-only" disabled={isSubmitting}
            accept="image/*,application/pdf,.doc,.docx"
          />
        </div>

        {files.length > 0 && (
          <div className="space-y-3">
            <p className="text-secondary-light text-xs uppercase tracking-wide font-semibold ml-1">{t('fileUploadForm.selected_files_title')}</p>
            {files.map((file, index) => (
              <div key={`${file.name}-${file.lastModified}-${index}`} className="bg-background-off p-4 rounded-2xl flex items-center justify-between border border-slate-100 overflow-hidden">
                <div className="flex items-center space-x-3 flex-1 min-w-0 mr-2">
                    <DocumentIcon className="w-5 h-5 text-primary flex-shrink-0" />
                    {/* Strictly limit width and truncate using JS as fallback + CSS */}
                    <span 
                      className="truncate font-medium text-secondary text-sm max-w-[180px] md:max-w-full" 
                      title={file.name}
                    >
                      {truncateFilename(file.name)}
                    </span>
                </div>
                <button
                  type="button" onClick={() => handleRemoveFile(file)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                  aria-label={t('fileUploadForm.remove_file_aria', { fileName: file.name })}
                  disabled={isSubmitting}
                >
                  <XCircleIcon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showConditionalFields && (
          <div className="space-y-5 animate-fadeInUp">
            <div>
              <label htmlFor={nameInputId} className="block text-sm font-medium text-secondary mb-1.5">{t('fileUploadForm.name_label')}</label>
              <input
                type="text"
                name="name"
                id={nameInputId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('fileUploadForm.name_placeholder')}
                required
                aria-required="true"
                className="block w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white text-base text-secondary placeholder-slate-400 transition-all focus:outline-none"
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label htmlFor={phoneInputId} className="block text-sm font-medium text-secondary mb-1.5">{t('fileUploadForm.phone_label')}</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 text-base pointer-events-none">🇪🇸 +34</span>
                <input
                  type="tel" name="phoneSuffix" id={phoneInputId} value={formatPhoneNumberSuffixForDisplay(phoneNumberSuffix)}
                  onChange={(e) => setPhoneNumberSuffix(e.target.value.replace(/\D/g,'').slice(0,9))}
                  placeholder={t('fileUploadForm.phone_placeholder')}
                  maxLength={11} autoComplete="tel-national" pattern="\d{3}\s?\d{3}\s?\d{3}"
                  title={t('fileUploadForm.phone_title')}
                  required
                  aria-required="true"
                  className="block w-full pl-24 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white text-base text-secondary placeholder-slate-400 transition-all focus:outline-none"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div 
              className={`form-element-transition overflow-hidden ${showWhatsAppOption ? 'form-element-visible-checkbox' : 'form-element-hidden'}`}
              style={{ maxHeight: showWhatsAppOption ? '5rem' : '0px' }} 
            >
              {showWhatsAppOption && (
                <div className="flex items-center p-4 bg-green-50/50 rounded-xl border border-green-100/50 mt-2">
                  <input
                    id={whatsAppCheckboxId} name="whatsappPreference" type="checkbox" checked={prefersWhatsApp}
                    onChange={(e) => setPrefersWhatsApp(e.target.checked)}
                    className="h-5 w-5 text-green-600 border-slate-300 rounded focus:ring-green-500 bg-white"
                    disabled={isSubmitting}
                  />
                  <label htmlFor={whatsAppCheckboxId} className="ml-3 block text-base text-secondary-DEFAULT font-medium">{t('fileUploadForm.whatsapp_checkbox_label')}</label>
                </div>
              )}
            </div>
            
            <div 
              className={`form-element-transition overflow-hidden ${showEmailField ? 'form-element-visible-email' : 'form-element-hidden'}`}
              style={{ maxHeight: showEmailField ? '200px' : '0px' }}
            >
              {showEmailField && (
                <div className="pt-2 pb-2 px-1"> 
                  <label htmlFor={emailInputId} className="block text-sm font-medium text-secondary mb-1.5">{t('fileUploadForm.email_label')}</label>
                  <input
                    type="email" name="email" id={emailInputId} value={email} onChange={(e) => setEmail(e.target.value)}
                    required={isEmailActuallyRequired} aria-required={isEmailActuallyRequired} autoComplete="email"
                    className="block w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white text-base text-secondary placeholder-slate-400 transition-all focus:outline-none"
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </div>
            <div>
              <button
                type="submit" disabled={isSubmitting || files.length === 0} aria-disabled={isSubmitting || files.length === 0}
                className={`w-full flex justify-center items-center py-3.5 px-6 border border-transparent rounded-full shadow-lg text-lg font-semibold text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-300 ease-in-out transform hover:scale-[1.02] active:scale-[0.98]`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    {t('fileUploadForm.submit_button_processing')}
                  </>
                ) : displayButtonText}
              </button>
            </div>
          </div>
        )}
        
        {submitMessage && (
          <div
            className={`rounded-xl p-4 text-center text-base font-medium ${
              submitMessage.toLowerCase().includes("éxito") || submitMessage.toLowerCase().includes("successfully") || submitMessage.toLowerCase().includes("ondo")
                ? 'bg-green-50 text-green-700 border border-green-100' 
                : submitMessage.toLowerCase().startsWith("error")
                ? 'bg-red-50 text-red-700 border border-red-100' 
                : 'bg-blue-50 text-blue-700 border border-blue-100'
            }`}
            role="alert"
          >
            {submitMessage}
          </div>
        )}
      </form>

      <div className="mt-6 pt-6 border-t border-slate-100 text-center">
        <div className="flex flex-col items-center gap-3">
          {/* Compact Status Pill */}
          <div className="inline-flex items-center gap-2 bg-green-50/80 px-3 py-1.5 rounded-full border border-green-100/50 shadow-sm">
             <div className="relative flex items-center justify-center">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
             </div>
             <span className="text-xs font-semibold text-green-700 tracking-wide">
                {t('fileUploadForm.manager_name', { _default: 'María' })} • {t('fileUploadForm.manager_status', { _default: 'En línea' })}
             </span>
          </div>

          <a
            href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center py-2.5 px-6 rounded-full bg-slate-50 text-secondary font-medium hover:bg-green-50 hover:text-green-700 transition-colors duration-300 border border-transparent hover:border-green-200 w-full sm:w-auto" 
            aria-label={t('fileUploadForm.whatsapp_aria_label')}
          >
            <WhatsAppIcon className="w-5 h-5 mr-2" />
            {t('fileUploadForm.whatsapp_cta_button')}
          </a>
        </div>

        <div className="mt-8 text-left space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            {trustBenefits.map((benefit, index) => (
            <div key={index} className="flex items-start space-x-3">
                <div className="mt-0.5 flex-shrink-0">
                    {benefit.icon}
                </div>
                <span className="text-sm text-secondary-light leading-tight font-medium">{benefit.text}</span>
            </div>
            ))}
        </div>

      </div>
    </div>
  );
};

export default FileUploadForm;
