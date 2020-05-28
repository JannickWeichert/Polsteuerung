var aufZweiStellenRunden = require('./utils').aufZweiStellenRunden;
var debug = require('./utils').debug;
var readOwfs = require('./owfsSensors').readOwfs;
var writeOwfs = require('./owfsSensors').writeOwfs;
var readSnmp = require('./snmp').readSnmp;
var leseLaufzeit = require('./laufzeit').leseLaufzeit;
var setzeLaufzeit = require('./laufzeit').setzeLaufzeit;
var config = require('./config');


class Poolsteuerung {

readSensors() {
	this.OWFS_MESSWERTE.forEach((config) => readOwfs(config.address, (reading) => config.onSuccess(reading)));
	this.SNMP_MESSWERTE.forEach((config) => readSnmp(config.address, (reading) => config.onSuccess(reading)));
	leseLaufzeit((auslesewert) => this.Laufzeit = auslesewert);
};

ueberpruefeWasserfluss() {
	clearInterval(this.checkFlowInterval);

	this.checkFlowInterval = setInterval(() => {
		readOwfs(this.WASSERFLUSS_SENSOR_ADRESSE, (messwert) => {
			if (messwert !== this.WASSERFLUSS_SENSOR_FLUSS) {
				debug("Kein Wasserfluss entdeckt, NOT AUS");
				SchaltePumpe(false);
				this.notAusAktiviert = true;
			}
		});
	}, this.CheckFlowDelay);
};

checkZeitfenster() {
	var hour = new Date().getHours();
	if (hour < this.Anfangsstunde || hour > this.Endstunde) {
		debug("Zeit ausserhalb des zulaessingen Zeitfensters von " + this.Anfangsstunde + " und " + this.Endstunde);
		return false;
	}
	return true;
};

setPumpDirection() {
	var Dach = this.PoolTemperatur < this.MaxTemperatur && this.DachTemperatur >= (this.PoolTemperatur + this.Temperaturdifferenz);
	!Dach && debug("Stelle auf Kreislauf, da die this.PoolTemperatur zu hoch oder die this.DachTemperatur zu niedrig ist.");
	this.WASSERFLUSS_CONFIG.forEach((config) => writeOwfs(config.adress, Dach ? config.dachValue : config.kreislaufValue, () => {}));
};

shouldPumpRun() {
	if (this.DachTemperatur < (this.PoolTemperatur + this.Temperaturdifferenz)) {
		debug("this.DachTemperatur zu niedrig: " + this.DachTemperatur + " Pool: " + this.PoolTemperatur + ", Differenz: " + aufZweiStellenRunden(this.DachTemperatur - this.PoolTemperatur) + " < " + this.Temperaturdifferenz + " Minimum");
		return false;
	}
	if (this.Strahlung < this.Strahlungsminimum) {
		debug("Sonnenthis.Strahlung zu gering: " + this.Strahlung + " < " + this.Strahlungsminimum + " Minimum");
		return false;
	}
	if (this.PoolTemperatur >this.MaxTemperatur) {
		debug("Temperatur zu hoch: " + this.PoolTemperatur + " > " + this.MaxTemperatur);
		return false;
	}
	return true;
};

ZeigeVariablen() {
	return "Vorlauf: " + this.VorlaufTemperatur + ", Ruecklauf: " + this.RuecklaufTemperatur + ", Dach: " + this.DachTemperatur + ", Sonnenthis.Strahlung: " + this.Strahlung + ", Pool: " + this.PoolTemperatur;
};

// Zustand = true -> Pumpe soll laufen
SchaltePumpe(Zustand) {
	if (Zustand && !this.notAusAktiviert) {
		this.setPumpDirection();
		this.ueberpruefeWasserfluss();
		this.Laufzeit += 1;
		setzeLaufzeit(this.Laufzeit);
		writeOwfs(this.PUMPEN_ADRESSE, this.PUMPE_AN_WERT, () => {});
	} else {
		writeOwfs(this.PUMPEN_ADRESSE, this.PUMPE_AUS_WERT, () => {});
		clearInterval(this.checkFlowInterval);
	}
};

BerechneLademodus() {
	if (this.Lademodus === "laden") {
		this.Ladestand += this.Strahlung;
		if (this.Ladestand > this.Ladelimit) {
			this.Lademodus = "entladen";
			debug("Entthis.Lademodus, Schalte Pumpe ein, this.Ladestand: " + this.Ladestand);
		} else {
			debug("this.Ladestand: " + this.Ladestand + ", es fehlen noch " + (this.Ladelimit - this.Ladestand) + ", Laderate: " + this.Strahlung);
		}
	} else if (this.Lademodus === "entladen") {
		this.Ladestand = this.Ladestand - this.Entladerate + this.Strahlung;
		debug("Verbleibender this.Ladestand: " + this.Ladestand + ", Laderate " + this.Strahlung + ", Entladerate: " + this.Entladerate);
		if (this.Ladestand <= 0) {
			this.Ladestand = 0;
			this.Lademodus = "laden";
			debug("this.Lademodus, Pumpe wird ausgeschaltet.");
		}
	}
};

Mindestzeit(testOnly) {
	if (!this.checkZeitfenster && this.Laufzeit > 0) {
		debug("Aushalb des Zeitfensters, setze this.Laufzeit zurueck");
		this.Laufzeit = 0;
	}
	if (this.Laufzeit < this.MindestLaufzeit) {
		var hour = new Date().getHours();
		if (this.Endstunde - hour === 1) {
			if (testOnly) return true;
			this.Lademodus = "entladen";
			debug("Starte Pumpe im Entthis.Lademodus, um MindestLaufzeit pro Tag zu erreichen, verbleibende Minuten: " + this.MindestLaufzeit - this.Laufzeit);
			return true;
		}
		return false;
	}
};

AktualisierePumpenStatus() {
	debug(this.ZeigeVariablen());
	if (this.Lademodus !== "entladen" && !this.Mindestzeit(true) && (!this.checkZeitfenster || !this.shouldPumpRun())) {
		if (this.Strahlung < this.Strahlungsminimum && this.Lademodus === "laden") {
			this.Ladestand -= this.EntladerateIdle;
			if (this.Ladestand <= 0) {
				this.Ladestand = 0;
			}
		}
		return;
	}
	this.BerechneLademodus();
	this.Mindestzeit();
	if (this.Lademodus === "entladen") {
		this.SchaltePumpe(true);
	} else {
		this.SchaltePumpe(false);
	}
};

setzeEinstellungen() {
// Settings
	this.Temperaturdifferenz = 0;
	this.Strahlungsminimum = -1; //400;
	this.Anfangsstunde = 10;
	this.Endstunde = 21;
	this.Entladerate = 1500;
	this.Ladelimit =  -2 ;//3000;
	this.EntladerateIdle = 200;
	this.CheckFlowDelay = 5000;
	this.MaxTemperatur = 28;
	this.MindestLaufzeit = 30;
	this.WiederholungsrateMs = 10 * 1000;
}

setzeKonstanten() {
	// Konstanten
	this.OWFS_MESSWERTE = [
		{address: '/26.DB3AB9010000/temperature', onSuccess: (reading) => this.DachTemperatur = reading},
		{address: '/10.F560E1010800/temperature', onSuccess: (reading) => this.VorlaufTemperatur = reading},
		//{address: '/10.D26FB5020800/temperature', onSuccess: (reading) => this.RuecklaufTemperatur = reading },
		{address: '/26.DB3AB9010000/vis', onSuccess: (reading) => this.Strahlung = Math.floor(17400 * reading)}
	];
	this.SNMP_MESSWERTE = [
		{address: "1.3.6.1.4.1.16174.1.1.1.3.2.2.0", onSuccess: (reading) => this.RuecklaufTemperatur = reading},
		{address: "1.3.6.1.4.1.16174.1.1.1.3.4.2.0", onSuccess: (reading) => this.PoolTemperatur = reading}
	];
	this.PUMPE_AN_WERT = 1;
	this.PUMPE_AUS_WERT = 0;
	this.WASSERFLUSS_SENSOR_ADRESSE = '/29.ACAA15000000/sensed.0';
	this.WASSERFLUSS_SENSOR_FLUSS = '1';
	this.WASSERFLUSS_CONFIG = [
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
	this.PUMPEN_ADRESSE = "/29.4D9718000000/PIO.0";
}

setzeVariablen() {
	// Variables
	this.PoolTemperatur = -1;
	this.DachTemperatur = -1;
	this.VorlaufTemperatur = -1;
	this.RuecklaufTemperatur = -1;
	this.Strahlung = -1;
	this.Laufzeit = 0;

	this.Ladestand = 0;
	this.Lademodus = "laden";

	this.checkFlowInterval = 0;
	this.notAusAktiviert = false;
}

constructor() {
	this.setzeEinstellungen();
	this.setzeKonstanten();
	this.setzeVariablen();
	this.ZeigeVariablen();
	setInterval(() => this.readSensors(), 20000);
	setInterval(() => this.AktualisierePumpenStatus(), this.WiederholungsrateMs);
	this.readSensors();
	setTimeout(() => this.AktualisierePumpenStatus(), 2000);
}

}

const poolsteuerung = new Poolsteuerung();
