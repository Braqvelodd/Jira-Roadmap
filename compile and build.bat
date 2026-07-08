@echo off
echo ==============================================
echo Building Jira Interactive Roadmap Dashboard
echo ==============================================

rem 1. Check/create directories
if not exist lib mkdir lib
if not exist src\main\java mkdir src\main\java
if not exist src\main\resources mkdir src\main\resources

rem 2. Bootstrap Gson dependency if missing
if not exist lib\gson-2.10.1.jar (
    echo Gson JAR not found. Downloading from Maven Central...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://repo1.maven.org/maven2/com/google/code/gson/gson/2.10.1/gson-2.10.1.jar' -OutFile 'lib\gson-2.10.1.jar'"
    if errorlevel 1 (
        echo Failed to download Gson JAR! Please download manually and place in lib\ folder.
        exit /b 1
    )
    echo Downloaded Gson successfully.
)

rem 3. Clean up old target build directory
if exist target rmdir /s /q target
mkdir target\classes
mkdir target\classes\resources

rem 4. Extract Gson classes for Fat JAR packaging
echo Extracting Gson classes for standalone integration...
powershell -Command "Copy-Item lib/gson-2.10.1.jar target/gson.zip; Expand-Archive target/gson.zip -DestinationPath target/classes -Force; Remove-Item target/gson.zip"
if errorlevel 1 (
    echo Failed to extract Gson!
    exit /b 1
)

rem 5. Compile source files using dynamic jfxrt.jar lookup
echo Locating jfxrt.jar and compiling Java source files...
powershell -Command "$jfxrt = (Get-ChildItem -Path 'C:\Program Files\Java', 'C:\Program Files (x86)\Java' -Filter jfxrt.jar -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1).FullName; if (-not $jfxrt) { Write-Host 'jfxrt.jar not found! Please install Java 8 JRE/JDK.'; exit 1 }; Write-Host 'Found jfxrt.jar at:' $jfxrt; javac --release 8 -d target/classes -cp ('lib/gson-2.10.1.jar;' + $jfxrt) src/main/java/*.java"
if errorlevel 1 (
    echo Compilation failed!
    exit /b 1
)

rem 6. Copy resource files
echo Copying frontend resource files...
copy src\main\resources\index.html target\classes\resources\
copy src\main\resources\index.css target\classes\resources\
copy src\main\resources\index.js target\classes\resources\

rem 7. Build executable runnable JAR
echo Building final runnable FAT JAR...
jar cfe JiraRoadmap.jar JiraRoadmapApp -C target/classes .
if errorlevel 1 (
    echo Failed to package JAR!
    exit /b 1
)

echo.
echo ==============================================
echo BUILD SUCCESSFUL!
echo Generated output: JiraRoadmap.jar
echo ==============================================
