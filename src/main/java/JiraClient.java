import com.google.gson.*;
import javax.net.ssl.*;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.KeyStore;
import java.security.Principal;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.*;

public class JiraClient {
    private String jiraUrl;
    private String selectedAlias = null;
    private SSLSocketFactory sslSocketFactory = null;

    public JiraClient(String jiraUrl) {
        setJiraUrl(jiraUrl);
        setupDefaultSSL();
    }

    public synchronized void setJiraUrl(String newJiraUrl) {
        if (newJiraUrl != null) {
            this.jiraUrl = newJiraUrl.endsWith("/") ? newJiraUrl.substring(0, newJiraUrl.length() - 1) : newJiraUrl;
        }
    }

    // Get list of client certificate aliases from Windows-MY keystore
    public List<String> getCertificateAliases() {
        List<String> aliases = new ArrayList<>();
        try {
            KeyStore ks = KeyStore.getInstance("Windows-MY");
            ks.load(null, null);
            Enumeration<String> enumeration = ks.aliases();
            while (enumeration.hasMoreElements()) {
                String alias = enumeration.nextElement();
                if (ks.isKeyEntry(alias)) {
                    aliases.add(alias);
                }
            }
        } catch (Exception e) {
            System.err.println("Error reading Windows-MY keystore: " + e.getMessage());
        }
        return aliases;
    }

    public void setCertificateAlias(String alias) {
        this.selectedAlias = alias;
        setupSSLWithClientCertificate();
    }

    // Trust all certificates, and optionally use selected client certificate
    private void setupDefaultSSL() {
        try {
            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, new TrustManager[]{new TrustAllManager()}, new java.security.SecureRandom());
            this.sslSocketFactory = sslContext.getSocketFactory();
        } catch (Exception e) {
            System.err.println("Error setting up default SSL: " + e.getMessage());
        }
    }

    private void setupSSLWithClientCertificate() {
        if (selectedAlias == null) {
            setupDefaultSSL();
            return;
        }

        try {
            KeyStore ks = KeyStore.getInstance("Windows-MY");
            ks.load(null, null);

            KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            kmf.init(ks, null);
            KeyManager[] kms = kmf.getKeyManagers();
            X509KeyManager defaultKeyManager = null;

            for (KeyManager km : kms) {
                if (km instanceof X509KeyManager) {
                    defaultKeyManager = (X509KeyManager) km;
                    break;
                }
            }

            if (defaultKeyManager == null) {
                throw new IllegalStateException("No X509KeyManager found in default KeyManagerFactory");
            }

            X509KeyManager customKeyManager = new SelectedAliasKeyManager(defaultKeyManager, selectedAlias);

            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(new KeyManager[]{customKeyManager}, new TrustManager[]{new TrustAllManager()}, new java.security.SecureRandom());
            this.sslSocketFactory = sslContext.getSocketFactory();
        } catch (Exception e) {
            System.err.println("Error configuring SSL with client certificate: " + e.getMessage());
            setupDefaultSSL(); // fallback
        }
    }

    private HttpURLConnection createConnection(String targetUrl, String method) throws IOException {
        URL url = new URL(targetUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);

        if (conn instanceof HttpsURLConnection) {
            HttpsURLConnection sconn = (HttpsURLConnection) conn;
            sconn.setSSLSocketFactory(sslSocketFactory);
            sconn.setHostnameVerifier((hostname, session) -> true);
        }
        return conn;
    }

    private String executeGetRequest(String urlStr) throws IOException {
        HttpURLConnection conn = createConnection(urlStr, "GET");
        conn.setRequestProperty("Accept", "application/json");

        int responseCode = conn.getResponseCode();
        if (responseCode >= 200 && responseCode < 300) {
            try (BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) {
                    response.append(line);
                }
                return response.toString();
            }
        } else {
            try (BufferedReader in = new BufferedReader(new InputStreamReader(conn.getErrorStream() != null ? conn.getErrorStream() : conn.getInputStream(), "UTF-8"))) {
                StringBuilder errorResponse = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) {
                    errorResponse.append(line);
                }
                throw new IOException("HTTP Error " + responseCode + ": " + errorResponse.toString());
            }
        }
    }

    private String executePutRequest(String urlStr, String jsonBody) throws IOException {
        HttpURLConnection conn = createConnection(urlStr, "PUT");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("Accept", "application/json");
        conn.setDoOutput(true);

        try (OutputStream os = conn.getOutputStream()) {
            byte[] input = jsonBody.getBytes("UTF-8");
            os.write(input, 0, input.length);
        }

        int responseCode = conn.getResponseCode();
        // PUT response from Jira might be 204 No Content
        if (responseCode >= 200 && responseCode < 300) {
            InputStream stream = conn.getInputStream();
            if (stream == null) {
                return "{\"success\":true}";
            }
            try (BufferedReader in = new BufferedReader(new InputStreamReader(stream, "UTF-8"))) {
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) {
                    response.append(line);
                }
                return response.length() > 0 ? response.toString() : "{\"success\":true}";
            }
        } else {
            InputStream errStream = conn.getErrorStream();
            if (errStream == null) {
                throw new IOException("HTTP Error " + responseCode);
            }
            try (BufferedReader in = new BufferedReader(new InputStreamReader(errStream, "UTF-8"))) {
                StringBuilder errorResponse = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) {
                    errorResponse.append(line);
                }
                throw new IOException("HTTP Error " + responseCode + ": " + errorResponse.toString());
            }
        }
    }

    // Fetches roadmap data, parses JQL, groups child issues under epics, and returns JSON
    public String getRoadmapData(String jql, String epicLinkField, String startDateField, String endDateField) throws Exception {
        String encodedJql = URLEncoder.encode(jql, "UTF-8");
        String fields = "key,summary,status,issuetype,labels,parent," + epicLinkField + "," + startDateField + "," + endDateField;
        String url = jiraUrl + "/rest/api/2/search?jql=" + encodedJql + "&fields=" + fields + "&maxResults=1000";

        String jsonResponse = executeGetRequest(url);
        JsonObject root = JsonParser.parseString(jsonResponse).getAsJsonObject();
        JsonArray issuesArray = root.getAsJsonArray("issues");

        List<Map<String, Object>> epics = new ArrayList<>();
        List<Map<String, Object>> standardIssues = new ArrayList<>();

        for (JsonElement element : issuesArray) {
            JsonObject issue = element.getAsJsonObject();
            String key = issue.get("key").getAsString();

            JsonObject fieldsObj = issue.getAsJsonObject("fields");
            String summary = getNullableString(fieldsObj, "summary");

            JsonObject statusObj = fieldsObj.getAsJsonObject("status");
            String statusName = statusObj != null ? getNullableString(statusObj, "name") : "";
            JsonObject statusCategoryObj = statusObj != null ? statusObj.getAsJsonObject("statusCategory") : null;
            String statusCategory = statusCategoryObj != null ? getNullableString(statusCategoryObj, "key") : "new";

            JsonObject issueTypeObj = fieldsObj.getAsJsonObject("issuetype");
            String issueType = issueTypeObj != null ? getNullableString(issueTypeObj, "name") : "";

            JsonArray labelsArray = fieldsObj.getAsJsonArray("labels");
            List<String> labels = new ArrayList<>();
            String healthStatus = "none";
            if (labelsArray != null) {
                for (JsonElement labelEl : labelsArray) {
                    String label = labelEl.getAsString();
                    labels.add(label);
                    if ("status-green".equalsIgnoreCase(label)) {
                        healthStatus = "green";
                    } else if ("status-yellow".equalsIgnoreCase(label)) {
                        healthStatus = "yellow";
                    } else if ("status-red".equalsIgnoreCase(label)) {
                        healthStatus = "red";
                    }
                }
            }

            String startDate = formatDate(getNullableString(fieldsObj, startDateField));
            String endDate = formatDate(getNullableString(fieldsObj, endDateField));

            // Extract Parent Key
            String parentKey = null;
            if (fieldsObj.has("parent") && !fieldsObj.get("parent").isJsonNull()) {
                JsonObject parentObj = fieldsObj.getAsJsonObject("parent");
                parentKey = getNullableString(parentObj, "key");
            } else if (fieldsObj.has(epicLinkField) && !fieldsObj.get(epicLinkField).isJsonNull()) {
                parentKey = fieldsObj.get(epicLinkField).getAsString();
            }

            Map<String, Object> issueMap = new HashMap<>();
            issueMap.put("key", key);
            issueMap.put("summary", summary);
            issueMap.put("statusName", statusName);
            issueMap.put("statusCategory", statusCategory);
            issueMap.put("healthStatus", healthStatus);
            issueMap.put("startDate", startDate);
            issueMap.put("endDate", endDate);
            issueMap.put("labels", labels);
            issueMap.put("parentKey", parentKey);
            issueMap.put("issueType", issueType);

            if ("Epic".equalsIgnoreCase(issueType)) {
                issueMap.put("childIssues", new ArrayList<Map<String, Object>>());
                epics.add(issueMap);
            } else {
                standardIssues.add(issueMap);
            }
        }

        // Map child issues to epics
        Map<String, Map<String, Object>> epicMap = new HashMap<>();
        for (Map<String, Object> epic : epics) {
            epicMap.put((String) epic.get("key"), epic);
        }

        List<Map<String, Object>> orphans = new ArrayList<>();

        for (Map<String, Object> issue : standardIssues) {
            String parentKey = (String) issue.get("parentKey");
            if (parentKey != null && epicMap.containsKey(parentKey)) {
                List<Map<String, Object>> children = (List<Map<String, Object>>) epicMap.get(parentKey).get("childIssues");
                children.add(issue);
            } else {
                orphans.add(issue);
            }
        }

        // Add orphans section if there are standard issues without epics and they have dates or any contents
        if (!orphans.isEmpty()) {
            Map<String, Object> orphanEpic = new HashMap<>();
            orphanEpic.put("key", "ISSUES-WITHOUT-EPICS");
            orphanEpic.put("summary", "Issues Without Epics");
            orphanEpic.put("statusName", "");
            orphanEpic.put("statusCategory", "new");
            orphanEpic.put("healthStatus", "none");
            orphanEpic.put("startDate", null);
            orphanEpic.put("endDate", null);
            orphanEpic.put("labels", new ArrayList<String>());
            orphanEpic.put("parentKey", null);
            orphanEpic.put("issueType", "Epic");
            orphanEpic.put("childIssues", orphans);
            epics.add(orphanEpic);
        }

        return new Gson().toJson(epics);
    }

    // Dynamic, thread-safe label update. Fetches current labels, modifies them, updates Jira.
    public synchronized String updateIssueStatus(String issueId, String newStatus) throws Exception {
        // Step 1: Fetch current issue labels
        String fetchUrl = jiraUrl + "/rest/api/2/issue/" + issueId + "?fields=labels";
        String jsonResponse = executeGetRequest(fetchUrl);
        JsonObject root = JsonParser.parseString(jsonResponse).getAsJsonObject();
        JsonObject fields = root.getAsJsonObject("fields");
        JsonArray labelsArray = fields.getAsJsonArray("labels");

        Set<String> cleanLabels = new LinkedHashSet<>();
        if (labelsArray != null) {
            for (JsonElement element : labelsArray) {
                String label = element.getAsString();
                if (!label.startsWith("status-")) {
                    cleanLabels.add(label);
                }
            }
        }

        // Step 2: Append new status label if valid
        if ("green".equalsIgnoreCase(newStatus) || "yellow".equalsIgnoreCase(newStatus) || "red".equalsIgnoreCase(newStatus)) {
            cleanLabels.add("status-" + newStatus.toLowerCase());
        }

        // Step 3: Write back to Jira
        JsonObject updateRoot = new JsonObject();
        JsonObject fieldsObject = new JsonObject();
        JsonArray newLabelsArray = new JsonArray();
        for (String label : cleanLabels) {
            newLabelsArray.add(label);
        }
        fieldsObject.add("labels", newLabelsArray);
        updateRoot.add("fields", fieldsObject);

        String updateUrl = jiraUrl + "/rest/api/2/issue/" + issueId;
        executePutRequest(updateUrl, new Gson().toJson(updateRoot));

        // Return updated status
        JsonObject successObj = new JsonObject();
        successObj.addProperty("success", true);
        successObj.addProperty("issueId", issueId);
        successObj.addProperty("healthStatus", newStatus);
        return new Gson().toJson(successObj);
    }

    private String getNullableString(JsonObject obj, String field) {
        if (obj == null || !obj.has(field) || obj.get(field).isJsonNull()) {
            return null;
        }
        return obj.get(field).getAsString();
    }

    private String formatDate(String rawDate) {
        if (rawDate == null || rawDate.length() < 10) {
            return null;
        }
        // Extract YYYY-MM-DD
        return rawDate.substring(0, 10);
    }

    private static class TrustAllManager implements X509TrustManager {
        @Override
        public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        @Override
        public void checkServerTrusted(X509Certificate[] chain, String authType) {}
        @Override
        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    }

    private static class SelectedAliasKeyManager implements X509KeyManager {
        private final X509KeyManager delegate;
        private final String selectedAlias;

        public SelectedAliasKeyManager(X509KeyManager delegate, String selectedAlias) {
            this.delegate = delegate;
            this.selectedAlias = selectedAlias;
        }

        @Override
        public String[] getClientAliases(String keyType, Principal[] issuers) {
            return new String[]{selectedAlias};
        }

        @Override
        public String chooseClientAlias(String[] keyType, Principal[] issuers, java.net.Socket socket) {
            return selectedAlias;
        }

        @Override
        public String[] getServerAliases(String keyType, Principal[] issuers) {
            return delegate.getServerAliases(keyType, issuers);
        }

        @Override
        public String chooseServerAlias(String keyType, Principal[] issuers, java.net.Socket socket) {
            return delegate.chooseServerAlias(keyType, issuers, socket);
        }

        @Override
        public X509Certificate[] getCertificateChain(String alias) {
            return delegate.getCertificateChain(alias);
        }

        @Override
        public PrivateKey getPrivateKey(String alias) {
            return delegate.getPrivateKey(alias);
        }
    }
}
