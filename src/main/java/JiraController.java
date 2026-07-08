import com.google.gson.JsonObject;

public class JiraController {
    private final JiraClient jiraClient;
    private final ConfigManager configManager;

    public JiraController(JiraClient jiraClient, ConfigManager configManager) {
        this.jiraClient = jiraClient;
        this.configManager = configManager;
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
     * Called by JavaScript frontend to fetch all epics and issues matching JQL
     */
    public String getRoadmapData() {
        try {
            String jql = configManager.getProperty("jira.jql", "");
            String epicLinkField = configManager.getProperty("jira.epicLinkField", "customfield_10014");
            String startDateField = configManager.getProperty("jira.startDateField", "customfield_10015");
            String endDateField = configManager.getProperty("jira.endDateField", "duedate");

            return jiraClient.getRoadmapData(jql, epicLinkField, startDateField, endDateField);
        } catch (Exception e) {
            e.printStackTrace();
            JsonObject errorObj = new JsonObject();
            errorObj.addProperty("success", false);
            errorObj.addProperty("error", e.getMessage() != null ? e.getMessage() : e.toString());
            return errorObj.toString();
        }
    }

    /**
     * Called by JavaScript frontend to update the status label of a specific issue
     */
    public String updateIssueStatus(String issueId, String newStatus) {
        try {
            return jiraClient.updateIssueStatus(issueId, newStatus);
        } catch (Exception e) {
            e.printStackTrace();
            JsonObject errorObj = new JsonObject();
            errorObj.addProperty("success", false);
            errorObj.addProperty("error", e.getMessage() != null ? e.getMessage() : e.toString());
            return errorObj.toString();
        }
    }

    /**
     * Simple log method to capture JavaScript console.log messages
     */
    public void log(String message) {
        System.out.println("[JS Console] " + message);
    }

    /**
     * Called by JavaScript frontend to save a modified JQL query
     */
    public void updateJql(String newJql) {
        if (newJql != null) {
            configManager.setProperty("jira.jql", newJql.trim());
            configManager.saveProperties();
            System.out.println("JQL query updated and saved to config.properties: " + newJql);
        }
    }
}
