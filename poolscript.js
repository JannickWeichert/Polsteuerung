var aufZweiStellenRunden = require('./utils').aufZweiStellenRunden;
var debug = require('./utils').debug;
var readOwfs = require('./owfsSensors').readOwfs;
var writeOwfs = require('./owfsSensors').writeOwfs;
var readSnmp = require('./snmp').readSnmp;
var leseLaufzeit = require('./laufzeit').leseLaufzeit;
var setzeLaufzeit = require('./laufzeit').setzeLaufzeit;

// Settings
var Temperaturdifferenz = 2;
var Strahlungsminimum = 400;
var Anfangsstunde = 10;
var Endstunde = 21;
var Entladerate = 1500;
var Ladelimit = 3000;
var EntladerateIdle = 200;
var CheckFlowDelay = 5000;
var MaxTemperatur = 28;
var Mindestlaufzeit = 30;
var WiederholungsrateMs = 60 * 1000;

// Konstanten
var OWFS_MESSWERTE = [
	{address: '/26.DB3AB9010000/temperature', onSuccess: (reading) => DachTemperatur = reading},
	{address: '/10.F560E1010800/temperature', onSuccess: (reading) => VorlaufTemperatur = reading},
	//{address: '/10.D26FB5020800/temperature', onSuccess: (reading) => RuecklaufTemperatur = reading },
	{address: '/26.DB3AB9010000/vis', onSuccess: (reading) => Strahlung = Math.floor(17400 * reading)}
];
var SNMP_MESSWERTE = [
	{address: "1.3.6.1.4.1.16174.1.1.1.3.2.2.0", onSuccess: (reading) => RuecklaufTemperatur = reading},
	{address: "1.3.6.1.4.1.16174.1.1.1.3.4.2.0", onSuccess: (reading) => PoolTemperatur = reading}
];
var PUMPEN_ADRESSE = '/29.4D9718000000/PIO.0';
var PUMPE_AN_WERT = 1;
var PUMPE_AUS_WERT = 0;
var WASSERFLUSS_SENSOR_ADRESSE = '/29.ACAA15000000/sensed.0';
var WASSERFLUSS_SENSOR_FLUSS = '1';
var WASSERFLUSS_CONFIG = [
	{
		address: '/29.4D9718000000/PIO.4',
		dachValue: 0,
		kreislaufValue: 1
	},
	{
		address: '/29.4D9718000000/PIO.5',
		dachValue: 1,
		kreislaufValue: 0
	}
];


// Variables
var PoolTemperatur = -1;
var DachTemperatur = -1;
var VorlaufTemperatur = -1;
var RuecklaufTemperatur = -1;
var Strahlung = -1;
var Laufzeit = 0;

var Ladestand = 0;
var Lademodus = "laden";

var checkFlowInterval;
var notAusAktiviert = false;

var readSensors = function () {
	OWFS_MESSWERTE.forEach((config) => readOwfs(config.address, (reading) => config.onSuccess(reading)));
	SNMP_MESSWERTE.forEach((config) => readSnmp(config.address, (reading) => config.onSuccess(reading)));
	leseLaufzeit((auslesewert) => Laufzeit = auslesewert);
};

var ueberpruefeWasserfluss = () => {
	clearInterval(checkFlowInterval);

	checkFlowInterval = setInterval(() => {
		readOwfs(WASSERFLUSS_SENSOR_ADRESSE, (messwert) => {
			if (messwert !== WASSERFLUSS_SENSOR_FLUSS) {
				debug("Kein Wasserfluss entdeckt, NOT AUS");
				SchaltePumpe(false);
				notAusAktiviert = true;
			}
		});
	}, CheckFlowDelay);
};

var checkZeitfenster = () => {
	var hour = new Date().getHours();
	if (hour < Anfangsstunde || hour > Endstunde) {
		debug("Zeit ausserhalb des zulaessingen Zeitfensters von " + Anfangsstunde + " und " + Endstunde);
		return false;
	}
	return true;
};

var setPumpDirection = () => {
	var Dach = PoolTemperatur < MaxTemperatur && DachTemperatur >= (PoolTemperatur + Temperaturdifferenz);
	!Dach && debug("Stelle auf Kreislauf, da die Pooltemperatur zu hoch oder die Dachtemperatur zu niedrig ist.");
	WASSERFLUSS_CONFIG.forEach((config) => writeOwfs(config.adress, Dach ? config.dachValue : config.kreislaufValue, () => {}));
};

var shouldPumpRun = () => {
	if (DachTemperatur < (PoolTemperatur + Temperaturdifferenz)) {
		debug("Dachtemperatur zu niedrig: " + DachTemperatur + " Pool: " + PoolTemperatur + ", Differenz: " + aufZweiStellenRunden(DachTemperatur - PoolTemperatur) + " < " + Temperaturdifferenz + " Minimum");
		return false;
	}
	if (Strahlung < Strahlungsminimum) {
		debug("Sonnenstrahlung zu gering: " + Strahlung + " < " + Strahlungsminimum + " Minimum");
		return false;
	}
	if (PoolTemperatur > MaxTemperatur) {
		debug("Temperatur zu hoch: " + Pooltemperatur + " > " + MaxTemperatur);
		return false;
	}
	return true;
};

var ZeigeVariablen = () => {
	return "Vorlauf: " + VorlaufTemperatur + ", Ruecklauf: " + RuecklaufTemperatur + ", Dach: " + DachTemperatur + ", Sonnenstrahlung: " + Strahlung + ", Pool: " + PoolTemperatur;
};

// Zustand = true -> Pumpe soll laufen
var SchaltePumpe = (Zustand) => {
	if (Zustand && !notAusAktiviert) {
		setPumpDirection();
		ueberpruefeWasserfluss();
		Laufzeit += 1;
		setzeLaufzeit(Laufzeit);
		writeOwfs(PUMPEN_ADRESSE, PUMPE_AN_WERT, () => {});
	} else {
		writeOwfs(PUMPEN_ADRESSE, PUMPE_AUS_WERT, () => {});
		clearInterval(checkFlowInterval);
	}
};

var BerechneLademodus = () => {
	if (Lademodus === "laden") {
		Ladestand += Strahlung;
		if (Ladestand > Ladelimit) {
			Lademodus = "entladen";
			debug("Entlademodus, Schalte Pumpe ein, Ladestand: " + Ladestand);
		} else {
			debug("Ladestand: " + Ladestand + ", es fehlen noch " + (Ladelimit - Ladestand) + ", Laderate: " + Strahlung);
		}
	} else if (Lademodus === "entladen") {
		Ladestand = Ladestand - Entladerate + Strahlung;
		debug("Verbleibender Ladestand: " + Ladestand + ", Laderate " + Strahlung + ", Entladerate: " + Entladerate);
		if (Ladestand <= 0) {
			Ladestand = 0;
			Lademodus = "laden";
			debug("Lademodus, Pumpe wird ausgeschaltet.");
		}
	}
};

var Mindestzeit = (testOnly) => {
	if (!checkZeitfenster && Laufzeit > 0) {
		debug("Aushalb des Zeitfensters, setze Laufzeit zurueck");
		Laufzeit = 0;
	}
	if (Laufzeit < Mindestlaufzeit) {
		var hour = new Date().getHours();
		if (Endstunde - hour === 1) {
			if (testOnly) return true;
			Lademodus = "entladen";
			debug("Starte Pumpe im Entlademodus, um Mindestlaufzeit pro Tag zu erreichen, verbleibende Minuten: " + Mindestlaufzeit - Laufzeit);
			return true;
		}
		return false;
	}
};

var AktualisierePumpenStatus = () => {
	debug(ZeigeVariablen());
	if (Lademodus !== "entladen" && !Mindestzeit(true) && (!checkZeitfenster || !shouldPumpRun())) {
		if (Strahlung < Strahlungsminimum && Lademodus === "laden") {
			Ladestand -= EntladerateIdle;
			if (Ladestand <= 0) {
				Ladestand = 0;
			}
		}
		return;
	}
	BerechneLademodus();
	Mindestzeit();
	if (Lademodus === "entladen") {
		SchaltePumpe(true);
	} else {
		SchaltePumpe(false);
	}
};


setInterval(readSensors, 20000);
setInterval(AktualisierePumpenStatus, WiederholungsrateMs);
readSensors();
setTimeout(AktualisierePumpenStatus, 2000);
