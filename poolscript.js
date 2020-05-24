var Client = require("owfs").Client
var snmp = require("net-snmp");
var HOST = "localhost";
var PORT = 4304;
var con = new Client(HOST, PORT)
var fs = require('fs');
var session = new snmp.createSession("192.168.255.236", "ades.1");

// Settings
var Temperaturdifferenz = -8;
var Strahlungsminimum = 400;
var Anfangsstunde = 10;
var Endstunde = 21;
var Entladerate = 1500;
var Ladelimit =  3000;
var EntladerateIdle = 200;
var CheckFlowDelay = 5000;
var MaxTemperatur = 28;
var Mindestlaufzeit = 30;
var WiederholungsrateMs = 60 * 1000;

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

var debug = (message) => {
	var datum = new Date();
	datum = datum.toISOString().replace(/T/, ' ').replace(/\..+/, '');
	console.log(datum," - ", message);
}

var leseLaufzeit = () => {
	try {
		fs.readFile('laufzeit.txt', (err, data) => {
		if(err) {
     		   throw err;
    		}
		Laufzeit = parseInt(data.toString());
		});
	} catch (e) {
		debug("Loading Laufzeit failed " + e);
	}
}

var setzeLaufzeit = () => {
	try {
                fs.writeFile('laufzeit.txt', Laufzeit.toString(), (err) => {
	                if(err) {
        	           throw err;
                	}
                });
        } catch (e) {
                debug("Writing Laufzeit failed " + e);
        }
}

var aufZweiStellenRunden = (number) => {
	if (typeof number === "string") {
		try {
			number = parseFloat(number);
		} catch (e) {
			return;
		}
	}
	if (typeof number === "number") {
		return Math.round(100 * number) / 100;
	}
}

var readSensors = function() {
/*  con.read("/10.D26FB5020800/temperature", function(err, result){
	if ( result !== undefined && result > 0) {
		RuecklaufTemperatur = aufZweiStellenRunden(result);
	}
  })
*/
  con.read("/26.DB3AB9010000/temperature", function(err, result){
        if ( result !== undefined && result > 0) {
                DachTemperatur = aufZweiStellenRunden(result);
        } 
  })
  con.read("/10.F560E1010800/temperature", function(err, result){ 
        if ( result !== undefined && result > 0) {
                VorlaufTemperatur = aufZweiStellenRunden(result);     
        } 
  })
  con.read("/26.DB3AB9010000/vis", function(err, result){ 
        if ( result !== undefined && result > 0) {
                Strahlung = Math.floor(17400 * result);     
        } 
  })
	session.get(["1.3.6.1.4.1.16174.1.1.1.3.2.2.0"], function (error, varbinds) {
                if (varbinds && !error) {
                        try { RuecklaufTemperatur = parseFloat(varbinds[0].value); } catch {}
                }
        });
	session.get(["1.3.6.1.4.1.16174.1.1.1.3.4.2.0"], function (error, varbinds) {
    		if (varbinds && !error) {
        		try { PoolTemperatur = parseFloat(varbinds[0].value); } catch {}
		}
	});
	leseLaufzeit();
}
 
var checkFlow = () => {
	clearInterval(checkFlowInterval);
	checkFlowInterval = setInterval(() => {	
		con.read("/29.ACAA15000000/sensed.0", function(err, result){ 
			if (result !== "0") {
				debug("Kein Wasserfluss entdeckt, NOT AUS");
				SchaltePumpe(false);
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
}

var setPumpDirection = () => {
	var Dach = PoolTemperatur < MaxTemperatur && DachTemperatur >= (PoolTemperatur + Temperaturdifferenz);
	!Dach && debug("Stelle auf Kreislauf, da die Pooltemperatur zu hoch oder die Dachtemperatur zu niedrig ist.");
	con.write("/29.4D9718000000/PIO.4", Dach ? 0 : 1, () => {}); // if Dach then 0 else 1
	con.write("/29.4D9718000000/PIO.5", Dach ? 1 : 0, () => {});
}

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
} 

var ZeigeVariablen = () => {
	return "Vorlauf: " + VorlaufTemperatur + ", Ruecklauf: " + RuecklaufTemperatur + ", Dach: " + DachTemperatur + ", Sonnenstrahlung: " + Strahlung + ", Pool: " + PoolTemperatur;
}

// Zustand = true -> Pumpe soll laufen
var SchaltePumpe = (Zustand) => {
	if (Zustand) {
		setPumpDirection();
		checkFlow();
		Laufzeit += 1;
		setzeLaufzeit();
		con.write("/29.4D9718000000/PIO.0", 1, () => {});	
	} else {
		con.write("/29.4D9718000000/PIO.0", 0, () => {});
		clearInterval(checkFlowInterval);
	}
}

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
}

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
}

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
}


setInterval(readSensors, 20000);
setInterval(AktualisierePumpenStatus, WiederholungsrateMs);
readSensors();
setTimeout(AktualisierePumpenStatus, 2000);
