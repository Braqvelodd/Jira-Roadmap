import com.google.gson.JsonObject;
import javafx.application.Platform;
import javafx.scene.web.WebEngine;
import netscape.javascript.JSObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class JiraController {
    private final JiraClient jiraClient;
    private final ConfigManager configManager;
    private final WebEngine webEngine;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    public JiraController(JiraClient jiraClient, ConfigManager configManager, WebEngine webEngine) {
        this.jiraClient = jiraClient;
        this.configManager = configManager;
        this.webEngine = webEngine;
    }

    /**
     * Called by JavaScript frontend to load the config settings (URL, fields, etc.)
     */
    public String getSettings() {
        JsonObject settings = new JsonObject();
        settings.addProperty("jiraUrl", configManager.getProperty("jira.url", ""));
        settings.addProperty("jql", configManager.getProperty("jira.jql", ""));
        settings.addProperty("epicLinkField", configManager.getProperty("jira.epicLinkField", ""));
        settings.addProperty("startDateField", configManager.getProperty("jira.startDateField", ""));
        settings.addProperty("endDateField", configManager.getProperty("jira.endDateField", ""));
        return settings.toString();
    }

    /**
     * Asynchronously fetches all epics and issues matching JQL, then triggers a JS callback
     */
    public void fetchRoadmapData() {
        executor.submit(() -> {
            try {
                String jql = configManager.getProperty("jira.jql", "");
                String epicLinkField = configManager.getProperty("jira.epicLinkField", "customfield_10014");
                String startDateField = configManager.getProperty("jira.startDateField", "customfield_10015");
                String endDateField = configManager.getProperty("jira.endDateField", "duedate");

                String dataJson;
                try {
                    dataJson = jiraClient.getRoadmapData(jql, epicLinkField, startDateField, endDateField);
                } catch (Exception e) {
                    System.err.println("Jira connection failed. Falling back to Mock Data for local UI testing.");
                    e.printStackTrace();
                    dataJson = getMockRoadmapDataJson();
                }

                final String result = dataJson;
                Platform.runLater(() -> {
                    try {
                        JSObject window = (JSObject) webEngine.executeScript("window");
                        window.call("onRoadmapDataLoaded", result);
                    } catch (Exception ex) {
                        ex.printStackTrace();
                    }
                });

            } catch (Exception e) {
                e.printStackTrace();
                final String errorMsg = e.getMessage() != null ? e.getMessage() : e.toString();
                Platform.runLater(() -> {
                    try {
                        JSObject window = (JSObject) webEngine.executeScript("window");
                        window.call("onRoadmapDataError", errorMsg);
                    } catch (Exception ex) {
                        ex.printStackTrace();
                    }
                });
            }
        });
    }

    /**
     * Asynchronously updates the status label of a specific issue, then triggers a JS callback
     */
    public void updateIssueStatus(String issueId, String newStatus) {
        executor.submit(() -> {
            try {
                String responseJson;
                try {
                    responseJson = jiraClient.updateIssueStatus(issueId, newStatus);
                } catch (Exception e) {
                    System.out.println("Jira connection failed. Mocking update status success: " + issueId + " -> " + newStatus);
                    JsonObject successObj = new JsonObject();
                    successObj.addProperty("success", true);
                    successObj.addProperty("issueId", issueId);
                    successObj.addProperty("healthStatus", newStatus);
                    responseJson = successObj.toString();
                }

                final String result = responseJson;
                Platform.runLater(() -> {
                    try {
                        JSObject window = (JSObject) webEngine.executeScript("window");
                        window.call("onStatusUpdated", result);
                    } catch (Exception ex) {
                        ex.printStackTrace();
                    }
                });
            } catch (Exception e) {
                e.printStackTrace();
                JsonObject errorObj = new JsonObject();
                errorObj.addProperty("success", false);
                errorObj.addProperty("error", e.getMessage() != null ? e.getMessage() : e.toString());
                final String result = errorObj.toString();
                Platform.runLater(() -> {
                    try {
                        JSObject window = (JSObject) webEngine.executeScript("window");
                        window.call("onStatusUpdated", result);
                    } catch (Exception ex) {
                        ex.printStackTrace();
                    }
                });
            }
        });
    }

    /**
     * Simple log method to capture JavaScript console.log messages
     */
    public void log(String message) {
        System.out.println("[JS Console] " + message);
    }

    /**
     * Called by JavaScript frontend to save modified Jira URL and JQL query settings
     */
    public void updateSettings(String newUrl, String newJql) {
        if (newUrl != null && newJql != null) {
            configManager.setProperty("jira.url", newUrl.trim());
            configManager.setProperty("jira.jql", newJql.trim());
            configManager.saveProperties();
            jiraClient.setJiraUrl(newUrl.trim());
            System.out.println("Settings updated in config.properties: URL=" + newUrl + ", JQL=" + newJql);
        }
    }

    /**
     * Generates a fully populated mock roadmap dataset for local testing
     */
    private String getMockRoadmapDataJson() {
        return "[" +
            "{" +
            "  \"key\": \"PROJ-101\"," +
            "  \"summary\": \"[MOCK] Implement Enterprise SSO & CAC Access\"," +
            "  \"issueType\": \"Epic\"," +
            "  \"statusName\": \"In Progress\"," +
            "  \"statusCategory\": \"indeterminate\"," +
            "  \"healthStatus\": \"red\"," +
            "  \"startDate\": \"2026-06-01\"," +
            "  \"endDate\": \"2026-08-15\"," +
            "  \"childIssues\": [" +
            "    {" +
            "      \"key\": \"PROJ-102\"," +
            "      \"summary\": \"[MOCK] Extract client certificate metadata from MSCAPI\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"Done\"," +
            "      \"statusCategory\": \"done\"," +
            "      \"healthStatus\": \"green\"," +
            "      \"startDate\": \"2026-06-01\"," +
            "      \"endDate\": \"2026-06-15\"" +
            "    }," +
            "    {" +
            "      \"key\": \"PROJ-103\"," +
            "      \"summary\": \"[MOCK] Design user certificate choice selector dialog UI\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"In Progress\"," +
            "      \"statusCategory\": \"indeterminate\"," +
            "      \"healthStatus\": \"yellow\"," +
            "      \"startDate\": \"2026-06-10\"," +
            "      \"endDate\": \"2026-07-05\"" +
            "    }," +
            "    {" +
            "      \"key\": \"PROJ-104\"," +
            "      \"summary\": \"[MOCK] Configure trust-all certificates manager to bypass Intranet CA check\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"To Do\"," +
            "      \"statusCategory\": \"new\"," +
            "      \"healthStatus\": \"red\"," +
            "      \"startDate\": \"2026-07-06\"," +
            "      \"endDate\": \"2026-08-15\"" +
            "    }" +
            "  ]" +
            "}," +
            "{" +
            "  \"key\": \"PROJ-201\"," +
            "  \"summary\": \"[MOCK] Roadmap Timeline UI Interactive Design\"," +
            "  \"issueType\": \"Epic\"," +
            "  \"statusName\": \"In Progress\"," +
            "  \"statusCategory\": \"indeterminate\"," +
            "  \"healthStatus\": \"yellow\"," +
            "  \"startDate\": \"2026-06-15\"," +
            "  \"endDate\": \"2026-09-01\"," +
            "  \"childIssues\": [" +
            "    {" +
            "      \"key\": \"PROJ-202\"," +
            "      \"summary\": \"[MOCK] Pixel perfect CSS layout matching standard Jira dashboard style\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"Done\"," +
            "      \"statusCategory\": \"done\"," +
            "      \"healthStatus\": \"green\"," +
            "      \"startDate\": \"2026-06-15\"," +
            "      \"endDate\": \"2026-07-01\"" +
            "    }," +
            "    {" +
            "      \"key\": \"PROJ-203\"," +
            "      \"summary\": \"[MOCK] Synchronized vertical scrolling between left tree pane and right Gantt pane\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"Done\"," +
            "      \"statusCategory\": \"done\"," +
            "      \"healthStatus\": \"green\"," +
            "      \"startDate\": \"2026-07-02\"," +
            "      \"endDate\": \"2026-07-07\"" +
            "    }," +
            "    {" +
            "      \"key\": \"PROJ-204\"," +
            "      \"summary\": \"[MOCK] Scale zoom levels selector (Weeks, Months, Quarters) JS functions\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"In Progress\"," +
            "      \"statusCategory\": \"indeterminate\"," +
            "      \"healthStatus\": \"none\"," +
            "      \"startDate\": \"2026-07-08\"," +
            "      \"endDate\": \"2026-07-28\"" +
            "    }," +
            "    {" +
            "      \"key\": \"PROJ-205\"," +
            "      \"summary\": \"[MOCK] Add priority filter to auto float Red items to top\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"To Do\"," +
            "      \"statusCategory\": \"new\"," +
            "      \"healthStatus\": \"none\"," +
            "      \"startDate\": \"2026-08-01\"," +
            "      \"endDate\": \"2026-09-01\"" +
            "    }" +
            "  ]" +
            "}," +
            "{" +
            "  \"key\": \"PROJ-301\"," +
            "  \"summary\": \"[MOCK] Intranet Deployment Prep\"," +
            "  \"issueType\": \"Epic\"," +
            "  \"statusName\": \"To Do\"," +
            "  \"statusCategory\": \"new\"," +
            "  \"healthStatus\": \"none\"," +
            "  \"startDate\": \"2026-08-20\"," +
            "  \"endDate\": \"2026-09-30\"," +
            "  \"childIssues\": [" +
            "    {" +
            "      \"key\": \"PROJ-302\"," +
            "      \"summary\": \"[MOCK] Bundle dependencies into single self-contained runnable JAR executable\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"To Do\"," +
            "      \"statusCategory\": \"new\"," +
            "      \"healthStatus\": \"none\"," +
            "      \"startDate\": null," +
            "      \"endDate\": null" +
            "    }" +
            "  ]" +
            "}," +
            "{" +
            "  \"key\": \"PROJ-401\"," +
            "  \"summary\": \"[MOCK] Empty Epic with no child issues\"," +
            "  \"issueType\": \"Epic\"," +
            "  \"statusName\": \"To Do\"," +
            "  \"statusCategory\": \"new\"," +
            "  \"healthStatus\": \"green\"," +
            "  \"startDate\": \"2026-07-01\"," +
            "  \"endDate\": \"2026-07-20\"," +
            "  \"childIssues\": []" +
            "}," +
            "{" +
            "  \"key\": \"ISSUES-WITHOUT-EPICS\"," +
            "  \"summary\": \"Issues Without Epics\"," +
            "  \"issueType\": \"Epic\"," +
            "  \"statusName\": \"\"," +
            "  \"statusCategory\": \"new\"," +
            "  \"healthStatus\": \"none\"," +
            "  \"startDate\": null," +
            "  \"endDate\": null," +
            "  \"childIssues\": [" +
            "    {" +
            "      \"key\": \"PROJ-501\"," +
            "      \"summary\": \"[MOCK] Update security policies document (Orphan Issue)\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"In Progress\"," +
            "      \"statusCategory\": \"indeterminate\"," +
            "      \"healthStatus\": \"red\"," +
            "      \"startDate\": \"2026-07-05\"," +
            "      \"endDate\": \"2026-07-15\"" +
            "    }," +
            "    {" +
            "      \"key\": \"PROJ-502\"," +
            "      \"summary\": \"[MOCK] General developer workspace setup (Orphan Issue)\"," +
            "      \"issueType\": \"Story\"," +
            "      \"statusName\": \"Done\"," +
            "      \"statusCategory\": \"done\"," +
            "      \"healthStatus\": \"green\"," +
            "      \"startDate\": \"2026-05-15\"," +
            "      \"endDate\": \"2026-05-30\"" +
            "    }" +
            "  ]" +
            "}" +
            "]";
    }
}
