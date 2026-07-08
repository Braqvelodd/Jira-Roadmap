import javafx.application.Application;
import javafx.application.Platform;
import javafx.concurrent.Worker;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.GridPane;
import javafx.scene.web.WebEngine;
import javafx.scene.web.WebView;
import javafx.stage.Stage;
import netscape.javascript.JSObject;
import java.util.List;
import java.util.Optional;

public class JiraRoadmapApp extends Application {

    private ConfigManager configManager;
    private JiraClient jiraClient;
    private JiraController jiraController;

    @Override
    public void start(Stage primaryStage) {
        try {
            // 1. Initialize configuration manager
            configManager = new ConfigManager();

            // 2. Bootstrap configuration if it's the placeholder default
            if (configManager.isPlaceholder()) {
                if (!showConfigSetupDialog()) {
                    System.out.println("Configuration setup cancelled. Exiting.");
                    Platform.exit();
                    return;
                }
            }

            // 3. Initialize Jira Client
            String jiraUrl = configManager.getProperty("jira.url", "");
            jiraClient = new JiraClient(jiraUrl);

            // 4. Handle client certificate selection from Windows-MY
            List<String> aliases = jiraClient.getCertificateAliases();
            if (!aliases.isEmpty()) {
                showCertificateSelectionDialog(aliases);
            } else {
                Alert alert = new Alert(Alert.AlertType.INFORMATION);
                alert.setTitle("No Certificates Found");
                alert.setHeaderText("Mutual SSL (CAC/PKI)");
                alert.setContentText("No client certificates were found in the Windows Personal Store.\n" +
                                     "The application will proceed using standard connection settings.");
                alert.showAndWait();
            }

            // 5. Initialize Controller
            jiraController = new JiraController(jiraClient, configManager);

            // 6. Setup WebView & WebView Bridge
            WebView webView = new WebView();
            WebEngine webEngine = webView.getEngine();

            // Enable JavaScript alert/confirm dialogs inside JavaFX WebView
            webEngine.setOnAlert(event -> {
                Alert alert = new Alert(Alert.AlertType.INFORMATION);
                alert.setTitle("Jira Dashboard Alert");
                alert.setHeaderText(null);
                alert.setContentText(event.getData());
                alert.showAndWait();
            });

            // Bridge Java object to JS
            webEngine.getLoadWorker().stateProperty().addListener((observable, oldValue, newValue) -> {
                if (newValue == Worker.State.SUCCEEDED) {
                    JSObject window = (JSObject) webEngine.executeScript("window");
                    window.setMember("backend", jiraController);
                    // Redirect javascript console.log to standard out
                    webEngine.executeScript(
                        "console.log = function(message) {\n" +
                        "    if (typeof message === 'object') {\n" +
                        "        window.backend.log(JSON.stringify(message));\n" +
                        "    } else {\n" +
                        "        window.backend.log(String(message));\n" +
                        "    }\n" +
                        "};"
                    );
                    System.out.println("Bridge registered and page loaded successfully.");
                }
            });

            // Load resources
            String resourcePath = getClass().getResource("/resources/index.html").toExternalForm();
            webEngine.load(resourcePath);

            // 7. Render main window
            Scene scene = new Scene(webView, 1280, 800);
            primaryStage.setScene(scene);
            primaryStage.setTitle("Jira Interactive Roadmap Dashboard");
            primaryStage.show();

        } catch (Exception e) {
            e.printStackTrace();
            showErrorAlert("Application Startup Error", e.getMessage() != null ? e.getMessage() : e.toString());
            Platform.exit();
        }
    }

    private boolean showConfigSetupDialog() {
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Jira Connection Configuration");
        dialog.setHeaderText("Please configure your Jira integration settings.");

        ButtonType saveButtonType = new ButtonType("Save Config", ButtonBar.ButtonData.OK_DONE);
        dialog.getDialogPane().getButtonTypes().addAll(saveButtonType, ButtonType.CANCEL);

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(10);

        TextField urlField = new TextField(configManager.getProperty("jira.url", "https://jira.yourcompany.com"));
        urlField.setPrefWidth(400);
        TextField jqlField = new TextField(configManager.getProperty("jira.jql", ""));
        jqlField.setPrefWidth(400);

        grid.add(new Label("Jira Base URL:"), 0, 0);
        grid.add(urlField, 1, 0);
        grid.add(new Label("JQL Query:"), 0, 1);
        grid.add(jqlField, 1, 1);

        dialog.getDialogPane().setContent(grid);

        Optional<ButtonType> result = dialog.showAndWait();
        if (result.isPresent() && result.get() == saveButtonType) {
            configManager.setProperty("jira.url", urlField.getText().trim());
            configManager.setProperty("jira.jql", jqlField.getText().trim());
            configManager.saveProperties();
            return true;
        }
        return false;
    }

    private void showCertificateSelectionDialog(List<String> aliases) {
        ChoiceDialog<String> dialog = new ChoiceDialog<>(aliases.get(0), aliases);
        dialog.setTitle("Certificate Selection");
        dialog.setHeaderText("Mutual SSL (CAC/PKI) Authentication Required");
        dialog.setContentText("Select a Client Certificate from your Windows Keystore:");

        Optional<String> result = dialog.showAndWait();
        if (result.isPresent()) {
            jiraClient.setCertificateAlias(result.get());
            System.out.println("Selected certificate alias: " + result.get());
        } else {
            System.out.println("No certificate selected, proceeding with default SSL context.");
        }
    }

    private void showErrorAlert(String title, String content) {
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(content);
        alert.showAndWait();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
