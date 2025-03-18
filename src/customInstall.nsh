; NSIS-скрипт для установки приложения

; Определение версии и имени приложения
!define APP_NAME "SPAPP"
!define APP_VERSION "0.0.1"

; Определение директории установки
!define INSTALL_DIR "C:\Program Files\SPAPP"

; Определение иконок
!define INSTALLER_ICON "icon.ico"
!define INSTALLER_HEADER_ICON "icon.ico"

; Определение ярлыков
!define DESKTOP_SHORTCUT "${INSTALL_DIR}\SPAPP.lnk"
!define START_MENU_SHORTCUT "${INSTALL_DIR}\SPAPP.lnk"

; Определение страницы выбора директории
!define MUI_DIRECTORYPAGE_TEXT_TOP "Выберите папку для установки ${APP_NAME}."

; Макросы MUI (Modern UI)
!include "MUI2.nsh"

; Инициализация MUI
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Основной скрипт установки
Section "Main Section" SEC01
  SetOutPath "${INSTALL_DIR}"
  
  ; Копирование всех файлов и поддиректорий из node_modules
 ; File /r "*.*"
  
  ; Копирование основных файлов приложения
  File "main.js"
  File "server.js"
  File "preload.js"
  File "db.js"
  File "icon.ico"
  
  ; Копирование других ресурсов (например, HTML, CSS, изображения)
  File /r "src\*.*"
  
SectionEnd

; Установка ярлыков
Section "Shortcuts" SEC02
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "${DESKTOP_SHORTCUT}" "${INSTALL_DIR}\SPAPP.exe"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${START_MENU_SHORTCUT}" "${INSTALL_DIR}\SPAPP.exe"
SectionEnd

; Секция деинсталляции
Section "Uninstall"
  Delete "${DESKTOP_SHORTCUT}"
  Delete "$SMPROGRAMS\${APP_NAME}\${START_MENU_SHORTCUT}"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  RMDir /r "${INSTALL_DIR}"
SectionEnd

; Настройка NSIS
Name "${APP_NAME} ${APP_VERSION}"
Caption "${APP_NAME} Setup"
OutFile "SPAPP Setup ${APP_VERSION}.exe"
Icon "${INSTALLER_ICON}"
InstallDir "${INSTALL_DIR}"
InstallDirRegKey HKLM "Software\${APP_NAME}" "Install_Dir"
ShowInstDetails show
ShowUnInstDetails show
