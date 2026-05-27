import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { LineChart } from "react-native-chart-kit";

// Only import icons on native platforms to avoid web font loader issues
let MaterialCommunityIcons = null;
if (Platform.OS !== "web") {
  MaterialCommunityIcons = require("@expo/vector-icons").MaterialCommunityIcons;
}
import axios from "axios";
import { io } from "socket.io-client";

const Tab = createBottomTabNavigator();
const { width } = Dimensions.get("window");
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE || "https://iot-monitor-backend-hmar.onrender.com";

const initialSettings = {
  minTemp: "15",
  maxTemp: "35",
  minHumidity: "30",
  maxHumidity: "70",
  email: "alerts@example.com"
};

const GlassCard = ({ children, colors }) => (
  <LinearGradient colors={colors} style={styles.card}>
    {children}
  </LinearGradient>
);

function DashboardScreen() {
  const [sensor, setSensor] = useState(null);
  const [history, setHistory] = useState([]);
  const [period, setPeriod] = useState("daily");
  const [status, setStatus] = useState({ online: false, lastUpdated: "-" });
  const [darkEnabled, setDarkEnabled] = useState(true);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      const [latestRes, historyRes] = await Promise.all([
        axios.get(`${API_BASE}/api/sensor/latest`),
        axios.get(`${API_BASE}/api/sensor/history?period=${period}`)
      ]);
      setSensor(latestRes.data);
      setHistory(historyRes.data || []);
    };

    loadData().catch(() => null);
  }, [period]);

  useEffect(() => {
    const socket = io(API_BASE, { transports: ["websocket"] });
    socket.on("sensor:update", (payload) => {
      setSensor(payload);
      setHistory((prev) => [...prev.slice(-19), payload]);
    });
    socket.on("device:status", (payload) => setStatus(payload));
    socket.on("alert:event", (event) => {
      setEvents((prev) => [event, ...prev.slice(0, 9)]);
      Alert.alert("Threshold Alert", event.message);
    });
    return () => socket.disconnect();
  }, []);

  const chartData = useMemo(
    () => ({
      labels: history.map((h) => h.timestamp?.slice(0, 5) || "--"),
      datasets: [{ data: history.map((h) => Number(h.temperature || 0)) }]
    }),
    [history]
  );

  const humidityChartData = useMemo(
    () => ({
      labels: history.map((h) => h.timestamp?.slice(0, 5) || "--"),
      datasets: [{ data: history.map((h) => Number(h.humidity || 0)) }]
    }),
    [history]
  );

  const reportDownload = (format) => {
    Linking.openURL(`${API_BASE}/api/export/${format}?period=${period}`);
  };

  const textColor = darkEnabled ? "#eaf2ff" : "#172033";

  return (
    <ScrollView style={[styles.container, darkEnabled ? styles.dark : styles.light]}>
      <StatusBar style={darkEnabled ? "light" : "dark"} />
      <View style={styles.topRow}>
        <Text style={[styles.title, { color: textColor }]}>IoT Industrial Dashboard</Text>
        <Switch value={darkEnabled} onValueChange={setDarkEnabled} />
      </View>
      <View>
        <GlassCard colors={["#2f80edcc", "#56ccf2aa"]}>
          <Text style={styles.metricLabel}>Temperature</Text>
          <Text style={styles.metricValue}>{sensor?.temperature ?? "--"} C</Text>
        </GlassCard>
      </View>
      <GlassCard colors={["#bb6bd9cc", "#8e44ad99"]}>
        <Text style={styles.metricLabel}>Humidity</Text>
        <Text style={styles.metricValue}>{sensor?.humidity ?? "--"} %</Text>
      </GlassCard>
      <GlassCard colors={["#232526cc", "#414345cc"]}>
        <Text style={styles.statusText}>
          Device: {status.online ? "Online" : "Offline"} | Last update:{" "}
          {sensor?.timestamp || status.lastUpdated}
        </Text>
      </GlassCard>

      <View style={styles.segmentRow}>
        {["daily", "weekly", "monthly"].map((p) => (
          <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={styles.segmentBtn}>
            <Text style={[styles.segmentText, period === p && styles.segmentTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: textColor }]}>Temperature Trend</Text>
      <LineChart
        data={chartData}
        width={Math.min(width - 24, 920)}
        height={220}
        withDots={false}
        withInnerLines={false}
        chartConfig={chartConfig}
        bezier
        style={styles.chart}
      />

      <Text style={[styles.sectionLabel, { color: textColor }]}>Humidity Trend</Text>
      <LineChart
        data={humidityChartData}
        width={Math.min(width - 24, 920)}
        height={220}
        withDots={false}
        withInnerLines={false}
        chartConfig={chartConfig}
        bezier
        style={styles.chart}
      />

      <View style={styles.downloadRow}>
        {["csv", "xlsx", "pdf"].map((format) => (
          <TouchableOpacity
            key={format}
            style={styles.downloadBtn}
            onPress={() => reportDownload(format)}
          >
            <Text style={styles.downloadText}>Download {format.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionLabel, { color: textColor }]}>Recent Alert Events</Text>
      {events.map((event) => (
        <View key={event._id || event.createdAt} style={styles.alertItem}>
          <Text style={styles.alertText}>{event.message}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function AlertSettingsScreen() {
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    axios
      .get(`${API_BASE}/api/settings`)
      .then((res) => {
        setSettings({
          minTemp: String(res.data.minTemp),
          maxTemp: String(res.data.maxTemp),
          minHumidity: String(res.data.minHumidity),
          maxHumidity: String(res.data.maxHumidity),
          email: String(res.data.email)
        });
      })
      .catch(() => null);
  }, []);

  const save = async () => {
    await axios.post(`${API_BASE}/api/settings`, {
      minTemp: Number(settings.minTemp),
      maxTemp: Number(settings.maxTemp),
      minHumidity: Number(settings.minHumidity),
      maxHumidity: Number(settings.maxHumidity),
      email: settings.email
    });
    Alert.alert("Saved", "Alert thresholds updated successfully.");
  };

  return (
    <ScrollView style={[styles.container, styles.dark]}>
      <Text style={styles.title}>Alert Settings</Text>
      {[
        ["Min Temperature", "minTemp"],
        ["Max Temperature", "maxTemp"],
        ["Min Humidity", "minHumidity"],
        ["Max Humidity", "maxHumidity"],
        ["Alert Email", "email"]
      ].map(([label, key]) => (
        <View key={key} style={styles.inputWrap}>
          <Text style={styles.inputLabel}>{label}</Text>
          <TextInput
            value={settings[key]}
            onChangeText={(text) => setSettings((prev) => ({ ...prev, [key]: text }))}
            style={styles.input}
            keyboardType={key === "email" ? "email-address" : "numeric"}
            autoCapitalize="none"
          />
        </View>
      ))}
      <TouchableOpacity style={styles.saveBtn} onPress={save}>
        <Text style={styles.saveText}>Save Thresholds</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const chartConfig = {
  backgroundGradientFrom: "#111b34",
  backgroundGradientTo: "#0f1627",
  decimalPlaces: 1,
  color: (opacity = 1) => `rgba(102, 208, 255, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(234, 242, 255, ${opacity})`,
  propsForBackgroundLines: {
    strokeDasharray: ""
  }
};

export default function App() {
  const scheme = useColorScheme();
  return (
    <NavigationContainer theme={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarStyle: { backgroundColor: "#0d1427", borderTopWidth: 0 },
          tabBarActiveTintColor: "#66d0ff",
          headerShown: false,
          tabBarIcon:
            Platform.OS !== "web" && MaterialCommunityIcons
              ? ({ color, size }) => (
                  <MaterialCommunityIcons
                    name={route.name === "Dashboard" ? "view-dashboard" : "bell-cog"}
                    size={size}
                    color={color}
                  />
                )
              : undefined
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="Alert Settings" component={AlertSettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 12, paddingTop: Platform.OS === "web" ? 16 : 48 },
  dark: { backgroundColor: "#081122" },
  light: { backgroundColor: "#edf2fa" },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  title: { color: "#eaf2ff", fontSize: 24, fontWeight: "700", marginBottom: 6 },
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ffffff2a"
  },
  metricLabel: { color: "#eaf2ffcc", fontSize: 14, marginBottom: 6 },
  metricValue: { color: "#fff", fontSize: 30, fontWeight: "700" },
  statusText: { color: "#eaf2ff", fontSize: 14, fontWeight: "500" },
  sectionLabel: { fontSize: 16, fontWeight: "700", marginVertical: 8 },
  chart: { borderRadius: 16, marginBottom: 8, alignSelf: "center" },
  inputWrap: { marginBottom: 14 },
  inputLabel: { color: "#cdd8ec", marginBottom: 6, fontWeight: "600" },
  input: {
    backgroundColor: "#13213e",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f325d",
    color: "#fff",
    paddingHorizontal: 12,
    height: 48
  },
  saveBtn: {
    backgroundColor: "#4f8cff",
    borderRadius: 14,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 40
  },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  segmentRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  segmentBtn: {
    flex: 1,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#2d4d7e",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center"
  },
  segmentText: { color: "#9fb6dc", textTransform: "capitalize" },
  segmentTextActive: { color: "#66d0ff", fontWeight: "700" },
  downloadRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 8 },
  downloadBtn: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "#1d2f57",
    height: 42,
    justifyContent: "center",
    alignItems: "center"
  },
  downloadText: { color: "#dce8ff", fontWeight: "600", fontSize: 12 },
  alertItem: {
    backgroundColor: "#301a2a",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderColor: "#60314e",
    borderWidth: 1
  },
  alertText: { color: "#ffc8dc", fontSize: 13 }
});
