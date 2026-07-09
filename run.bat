@echo off
if not exist JiraRoadmap.jar (
    echo JiraRoadmap.jar not found! Running build.bat first...
    call build.bat
)

rem Query registry for default jar launcher command
set CMD_VAL=
for /f "tokens=2,*" %%A in ('reg query "HKEY_CLASSES_ROOT\jarfile\shell\open\command" /ve 2^>nul') do (
    set CMD_VAL=%%B
)

set JAVA_EXE=
if not "%CMD_VAL%"=="" (
    rem Extract the executable path inside quotes
    for /f "tokens=1 delims=^"" %%I in ("%CMD_VAL%") do (
        set JAVA_EXE=%%I
    )
)

rem If we found javaw.exe, resolve it to java.exe in the same folder to preserve console logging
if not "%JAVA_EXE%"=="" (
    set JAVA_EXE=%JAVA_EXE:"=%
    call set JAVA_EXE=%%JAVA_EXE:javaw.exe=java.exe%%
)

if not "%JAVA_EXE%"=="" if exist "%JAVA_EXE%" (
    echo Found associated Java runtime at: "%JAVA_EXE%"
    echo Launching Jira Interactive Roadmap Dashboard...
    "%JAVA_EXE%" -jar JiraRoadmap.jar
    goto :end
)

rem Fallback to start command which emulates Windows double-click behavior
echo WARNING: Could not find associated Java runtime path in registry.
echo Launching using default Windows file association...
start "" "JiraRoadmap.jar"

:end
pause