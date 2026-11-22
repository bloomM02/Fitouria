#include <WiFi.h>
#include <PubSubClient.h>

// ---------- Pins ----------
const int POT_POLL = 34;  // pollution of incoming wastewater
const int POT_SALT = 35;  // salt
const int POT_PH   = 32;  // pH
const int POT_GERM = 39;  // seed germination test (0-100)
const int BTN_STOP = 33;  // emergency stop
const int LED_HEAT = 25, LED_PUMP = 26, LED_FAN = 27, LED_ALARM = 14;

// ---------- Network ----------
const char* WIFI_SSID = "Wokwi-GUEST";
const char* MQTT_HOST = "broker.hivemq.com";
const char* TOPIC     = "Zitori/Zitori/data";
WiFiClient net;
PubSubClient mqtt(net);

// ---------- Biochar line ----------
enum Bio { B_DRY, B_PYRO, B_COOL, B_SIEVE, B_QC, B_READY, B_REJECT };
const char* BIO_NAME[] = {"DRYING","PYROLYSIS","COOLING","SIEVING",
                          "QUALITY_CHECK","READY","REJECTED"};
Bio bio = B_DRY;
float tempC = 25, moisture = 55;
int bioTicks = 0, holdTicks = 0;
bool heat = false, fan = false, alarmOn = false;
String qcMsg = "-";

// ---------- Wastewater line ----------
enum Mar { M_SETTLE, M_DILUTE, M_FILTER, M_FULL };
const char* MAR_NAME[] = {"SETTLING","DILUTING","FILTERING","FILTER_FULL"};
Mar mar = M_SETTLE;
int marTicks = 0;
float sat = 0, vol = 0, feed = 0, outP = 0, removal = 0;
bool pump = false;
String soilMsg = "-";
const float DILUTION = 3.0;  // demo value: 1 part liquid for 2 parts water

// Reads a potentiometer and converts it to a range
float readPot(int pin, float lo, float hi) {
  return lo + (hi - lo) * analogRead(pin) / 4095.0;
}

void reconnect() {
  while (!mqtt.connected()) {
    String id = "olea-" + String(random(0xffff), HEX);
    if (mqtt.connect(id.c_str())) break;
    delay(2000);
  }
}

void stepBiochar(float ph, float salt, float germ) {
  switch (bio) {
    case B_DRY:
      heat = tempC < 110; fan = false;
      if (tempC >= 100) moisture -= 4;
      if (moisture <= 15) { bio = B_PYRO; holdTicks = 0; }
      break;
    case B_PYRO:
      heat = tempC < 500; fan = false;
      if (tempC >= 450) holdTicks++;
      if (holdTicks >= 20) bio = B_COOL;
      break;
    case B_COOL:
      heat = false; fan = true;
      if (tempC < 100) { bio = B_SIEVE; bioTicks = 0; fan = false; }
      break;
    case B_SIEVE:
      heat = false; fan = false;
      if (++bioTicks >= 5) bio = B_QC;
      break;
    case B_QC: {
      bool ok = (ph >= 6 && ph <= 10 && salt <= 50 && germ >= 80);
      qcMsg = ok ? "PASS" : "FAIL";
      bio = ok ? B_READY : B_REJECT;
      bioTicks = 0;
      break;
    }
    case B_READY:
    case B_REJECT:
      heat = false; fan = false;
      if (++bioTicks >= 15) { bio = B_DRY; moisture = 55; qcMsg = "-"; }
      break;
  }
}

void stepWater(float inP, float salt, float germ) {
  if (mar != M_FILTER) { feed = 0; outP = 0; removal = 0; }
  switch (mar) {
    case M_SETTLE:
      pump = false;
      if (++marTicks >= 5) { mar = M_DILUTE; marTicks = 0; }
      break;
    case M_DILUTE:
      pump = false;
      if (++marTicks >= 5) { mar = M_FILTER; marTicks = 0; }
      break;
    case M_FILTER:
      pump = true;
      feed = inP / DILUTION;
      sat += feed * 0.05;                       // filter fills up
      removal = fmaxf(5.0f, 90.0f * (1 - sat / 100.0f));
      outP = feed * (1 - removal / 100.0f);
      vol += 2;
      if (sat >= 85) {
        mar = M_FULL; marTicks = 0; pump = false;
        soilMsg = (germ >= 80 && salt <= 50) ? "USED_BIOCHAR_OK_FOR_SOIL"
                                             : "NOT_FOR_SOIL_COMPOST_MORE";
      }
      break;
    case M_FULL:
      pump = false;
      if (++marTicks >= 10) { sat = 0; mar = M_SETTLE; marTicks = 0; soilMsg = "-"; }
      break;
  }
}

// One step = 1 second of real time = 1 "minute" of the process
void step() {
  bool estop = (digitalRead(BTN_STOP) == LOW);
  float inP  = readPot(POT_POLL, 0, 100);
  float salt = readPot(POT_SALT, 0, 100);
  float ph   = readPot(POT_PH, 0, 14);
  float germ = readPot(POT_GERM, 0, 100);

  if (estop) { heat = false; pump = false; fan = true; }
  else { stepBiochar(ph, salt, germ); stepWater(inP, salt, germ); }

  // simple physical model of the reactor temperature
  if (heat) tempC += 40;
  else tempC -= (tempC - 25) * (fan ? 0.25 : 0.08);
  if (tempC > 760) tempC = 760;

  alarmOn = estop || tempC > 750;

  digitalWrite(LED_HEAT, heat);
  digitalWrite(LED_PUMP, pump);
  digitalWrite(LED_FAN, fan);
  digitalWrite(LED_ALARM, alarmOn);

  char buf[512];
  snprintf(buf, sizeof(buf),
    "{\"bio\":\"%s\",\"temp\":%.1f,\"moist\":%.1f,\"heat\":%d,\"fan\":%d,"
    "\"qc\":\"%s\",\"mar\":\"%s\",\"feed\":%.1f,\"out\":%.1f,\"removal\":%.1f,"
    "\"sat\":%.1f,\"vol\":%.0f,\"pump\":%d,\"soil\":\"%s\",\"ph\":%.1f,"
    "\"salt\":%.0f,\"germ\":%.0f,\"alarm\":%d}",
    BIO_NAME[bio], tempC, moisture, heat, fan, qcMsg.c_str(), MAR_NAME[mar],
    feed, outP, removal, sat, vol, pump, soilMsg.c_str(), ph, salt, germ, alarmOn);

  Serial.println(buf);
  mqtt.publish(TOPIC, buf);
}

void setup() {
  Serial.begin(115200);
  pinMode(BTN_STOP, INPUT_PULLUP);
  pinMode(LED_HEAT, OUTPUT); pinMode(LED_PUMP, OUTPUT);
  pinMode(LED_FAN, OUTPUT);  pinMode(LED_ALARM, OUTPUT);

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, "", 6);
  while (WiFi.status() != WL_CONNECTED) { delay(100); Serial.print("."); }
  Serial.println(" connected");

  mqtt.setServer(MQTT_HOST, 1883);
  mqtt.setBufferSize(512);
}

void loop() {
  if (!mqtt.connected()) reconnect();
  mqtt.loop();
  static unsigned long last = 0;
  if (millis() - last >= 1000) { last = millis(); step(); }
}