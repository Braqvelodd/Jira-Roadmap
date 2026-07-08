import java.io.*;
import java.util.Properties;

public class ConfigManager {
    private File configFile;
    private Properties properties = new Properties();

    public ConfigManager() {
        String userHome = System.getProperty("user.home");
        File configDir = new File(userHome, ".jiraroadmap");
        if (!configDir.exists()) {
            configDir.mkdirs();
        }
        configFile = new File(configDir, "config.properties");
        loadProperties();
    }

    private void loadProperties() {
        if (configFile.exists()) {
            try (InputStream input = new FileInputStream(configFile)) {
                properties.load(input);
            } catch (IOException e) {
                System.err.println("Error loading config.properties: " + e.getMessage());
            }
        } else {
            bootstrapDefaultConfig();
        }
    }

    private void bootstrapDefaultConfig() {
        properties.setProperty("jira.url", "https://jira.yourcompany.com");
        properties.setProperty("jira.jql", "project = PROJ AND issuetype in (Epic, Story, Task) ORDER BY created DESC");
        properties.setProperty("jira.epicLinkField", "customfield_10014");
        properties.setProperty("jira.startDateField", "customfield_10015");
        properties.setProperty("jira.endDateField", "duedate");
        saveProperties();
        System.out.println("Bootstrapped default config.properties in " + configFile.getAbsolutePath());
    }

    public void saveProperties() {
        try (OutputStream output = new FileOutputStream(configFile)) {
            properties.store(output, "Jira Interactive Roadmap Dashboard Configuration");
        } catch (IOException e) {
            System.err.println("Error saving config.properties: " + e.getMessage());
        }
    }

    public String getProperty(String key, String defaultValue) {
        return properties.getProperty(key, defaultValue);
    }

    public void setProperty(String key, String value) {
        properties.setProperty(key, value);
    }

    public boolean isPlaceholder() {
        return "https://jira.yourcompany.com".equals(getProperty("jira.url", ""));
    }
}
