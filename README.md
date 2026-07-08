# Jira Interactive Roadmap Dashboard

A standalone desktop application that visualizes a Jira roadmap using a JQL filter, offering interactive health status labels that write back to Jira in real time. It is compiled to target Java 8, designed for secure corporate intranets, and uses native Windows CAC/PKI certificate authentication.

---

## Features
1. **Interactive Timeline**: Pixel-perfect rendering of the native Jira roadmap (Epics + Child Issues) with timeline zoom levels for **Weeks**, **Months**, and **Quarters**.
2. **Dynamic Health Statuses**: Inline badge dropdowns (Green - No problems, Yellow - Minor problems, Red - Severe limitations) representing issue health.
3. **Real-time Write-Back**: Direct status changes write back to standard Jira labels (`status-green`, `status-yellow`, `status-red`) via safety logic (retrieves current labels, strips old health labels, appends new one).
4. **Blocker Priority Views**: A "Prioritize Blockers" toggle floats all Epics with a Red status (or containing a Red child issue) to the top of the roadmap.
5. **Dual Themes**: Toggle between Classic Jira Light Theme and a premium glassmorphic Dark Mode.
6. **Enterprise CAC/PKI Support**: Integrates directly with the Windows Certificate Store (`Windows-MY`), displaying a certificate picker on startup and prompting for smartcard PIN entry natively via Windows.
7. **Intranet Compatibility**: Configured in "trust all" SSL mode and bypasses hostname verification to avoid self-signed certificate warnings inside isolated networks.

---

## Project Structure
```
Jira-Roadmap/
├── lib/
│   └── gson-2.10.1.jar             # Local copy of Gson (automatically downloaded)
├── src/
│   └── main/
│       ├── java/
│       │   ├── JiraRoadmapApp.java  # JavaFX main entry, WebView, and dialogs
│       │   ├── JiraController.java  # JS-to-Java bridge controller
│       │   ├── JiraClient.java      # SSL context, Windows-MY CAC integration, Jira API
│       │   └── ConfigManager.java   # config.properties manager and bootstraper
│       └── resources/
│           ├── index.html           # HTML interface layout
│           ├── index.css            # Classic light / premium dark CSS
│           └── index.js             # Timeline rendering, positioning, and actions
├── build.bat                        # Compiles Java code & builds standalone JAR
├── run.bat                          # Executes the JAR using the Java 8 JRE
└── config.properties                # Bootstrapped local configuration file
```

---

## Setup & Execution

### 1. Build the Application
Double-click `build.bat` or run:
```cmd
build.bat
```
This script will:
- Check for and download the `gson-2.10.1.jar` dependency.
- Extract the Gson classes into `target/classes` for packaging.
- Compile the Java source files targeting Java 8 using `--release 8`.
- Bundle all classes and resources into a standalone executable: `JiraRoadmap.jar`.

### 2. Configure Settings
Upon first start, a configuration window will appear. Alternatively, you can edit the generated `config.properties` file in the same directory:
```properties
# Base URL of your enterprise Jira instance
jira.url=https://jira.yourcompany.com

# JQL query to retrieve epics and issues
jira.jql=project = PROJ AND issuetype in (Epic, Story, Task) ORDER BY created DESC

# Field mappings for your Jira instance (defaults provided)
jira.epicLinkField=customfield_10014
jira.startDateField=customfield_10015
jira.endDateField=duedate
```

### 3. Run the Application
Double-click `run.bat` or run:
```cmd
run.bat
```
This launcher script dynamically finds the local Java 8 JRE (which includes the JavaFX libraries needed to render the WebView) and launches the application.
- On startup, a dialog lists all client certificates found in the Windows Personal Store (CAC). Select the correct certificate to authenticate.
- If no certificates are found, the application falls back to standard connection mode.
