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

if not defined CMD_VAL goto :use_fallback

set JAVA_EXE=%CMD_VAL%
set JAVA_EXE=%JAVA_EXE: -jar "%1" %*=%
set JAVA_EXE=%JAVA_EXE: -jar "%1"=%
set JAVA_EXE=%JAVA_EXE: -jar =%
set JAVA_EXE=%JAVA_EXE:"=%

rem If we found javaw.exe, resolve it to java.exe in the same folder to preserve console logging
call set JAVA_EXE=%%JAVA_EXE:javaw.exe=java.exe%%

if exist "%JAVA_EXE%" (
    echo Found associated Java runtime at: "%JAVA_EXE%"
    echo Launching Jira Interactive Roadmap Dashboard...
    "%JAVA_EXE%" -jar JiraRoadmap.jar
    goto :end
)

:use_fallback
rem Fallback to start command which emulates Windows double-click behavior
echo WARNING: Could not find associated Java runtime path in registry.
echo Launching using default Windows file association...
start "" "JiraRoadmap.jar"

:end
pause