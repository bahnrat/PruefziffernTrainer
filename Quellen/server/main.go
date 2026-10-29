// Pruefziffer-Server: liefert den Prüfziffer-Trainer im Heimnetz aus und speichert die Daten.
// Eine einzige Datei, keine Installation. Mitspieler öffnen die angezeigte Adresse im Browser –
// auf PC, Tablet oder Handy.
package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
)

//go:embed index.html
var indexHTML []byte

const maxBody = 2 << 20

// Erlaubte Dateien – nichts anderes lässt sich lesen oder schreiben.
var allowed = regexp.MustCompile(`^(config\.json|users\.json|exams\.json|users/[0-9a-f]{16}\.json)$`)

var (
	dataDir string
	urls    []string
	writeMu sync.Mutex
)

func main() {
	exe, _ := os.Executable()
	defDir := filepath.Join(filepath.Dir(exe), "Pruefziffer-Daten")
	port := flag.Int("port", 8080, "Port")
	flag.StringVar(&dataDir, "daten", defDir, "Datenordner (z. B. auf der Netzwerk-Festplatte)")
	noBrowser := flag.Bool("ohne-browser", false, "Browser beim Start nicht öffnen")
	flag.Parse()
	consoleUTF8()

	if err := os.MkdirAll(filepath.Join(dataDir, "users"), 0o755); err != nil {
		fail("Datenordner lässt sich nicht anlegen: %v", err)
	}

	var ln net.Listener
	var err error
	for p := *port; p < *port+10; p++ {
		if ln, err = net.Listen("tcp", fmt.Sprintf(":%d", p)); err == nil {
			*port = p
			break
		}
	}
	if ln == nil {
		fail("Kein freier Port ab %d: %v", *port, err)
	}
	urls = lanURLs(*port)

	mux := http.NewServeMux()
	mux.HandleFunc("/", serveIndex)
	mux.HandleFunc("/api.php", serveAPI)
	mux.HandleFunc("/qr.svg", serveQR)

	fmt.Println()
	fmt.Println("  Prüfziffer-Trainer – Server")
	fmt.Println("  ───────────────────────────")
	fmt.Println("  Daten:", dataDir)
	fmt.Println()
	if len(urls) == 0 {
		fmt.Println("  Keine Netzwerkverbindung gefunden – nur an diesem PC erreichbar:")
		fmt.Printf("  http://localhost:%d\n", *port)
	} else {
		fmt.Println("  Mitspieler öffnen im Browser (selbes WLAN/Heimnetz):")
		for _, u := range urls {
			fmt.Println("   ", u)
		}
		fmt.Println()
		if q, err := Encode(urls[0]); err == nil {
			fmt.Print(q.Terminal())
		}
	}
	fmt.Println()
	fmt.Println("  Dieses Fenster offen lassen, solange gespielt wird.")
	fmt.Println("  Beenden: Fenster schließen oder Strg+C.")
	fmt.Println()

	if !*noBrowser {
		openBrowser(fmt.Sprintf("http://localhost:%d/", *port))
	}
	if err := http.Serve(ln, onlyHomeNetwork(mux)); err != nil {
		fail("Server beendet: %v", err)
	}
}

func fail(format string, a ...any) {
	fmt.Printf("\n  FEHLER: "+format+"\n\n  Eingabetaste zum Beenden …", a...)
	fmt.Scanln()
	os.Exit(1)
}

// Nur Anfragen aus dem eigenen Netz (privat, Loopback, link-local) – falls jemand den Port
// versehentlich im Router freigibt, bleibt der Trainer trotzdem privat.
func onlyHomeNetwork(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, _ := net.SplitHostPort(r.RemoteAddr)
		ip := net.ParseIP(host)
		if ip == nil || !(ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()) {
			http.Error(w, "Nur im Heimnetz erreichbar", http.StatusForbidden)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

func serveIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" && r.URL.Path != "/index.html" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(indexHTML)
}

func serveAPI(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("p")
	if p == "ping" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "name": "Pruefziffer-Server", "qr": true, "urls": urls})
		return
	}
	if !allowed.MatchString(p) {
		http.Error(w, "Datei nicht erlaubt", http.StatusBadRequest)
		return
	}
	path := filepath.Join(dataDir, filepath.FromSlash(p))
	switch r.Method {
	case http.MethodGet:
		b, err := os.ReadFile(path)
		if os.IsNotExist(err) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write(b)
	case http.MethodPost:
		writeMu.Lock()
		defer writeMu.Unlock()
		if r.URL.Query().Get("delete") == "1" {
			if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		b, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
		if err != nil || len(b) > maxBody || !json.Valid(b) {
			http.Error(w, "Ungültige Daten", http.StatusBadRequest)
			return
		}
		// erst in eine Hilfsdatei schreiben, dann austauschen – nie halb geschriebene Dateien
		tmp := path + ".tmp"
		if err := os.WriteFile(tmp, b, 0o644); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := os.Rename(tmp, path); err != nil {
			os.Remove(tmp)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Methode nicht erlaubt", http.StatusMethodNotAllowed)
	}
}

func serveQR(w http.ResponseWriter, r *http.Request) {
	u := r.URL.Query().Get("u")
	if u == "" || len(u) > 150 {
		http.Error(w, "Adresse fehlt", http.StatusBadRequest)
		return
	}
	q, err := Encode(u)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "image/svg+xml")
	io.WriteString(w, q.SVG(8))
}

// Adressen im Heimnetz, 192.168.x.x zuerst.
func lanURLs(port int) []string {
	out := []string{}
	ifaces, _ := net.Interfaces()
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok || ipn.IP.To4() == nil || !ipn.IP.IsPrivate() {
				continue
			}
			out = append(out, fmt.Sprintf("http://%s:%d", ipn.IP.String(), port))
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return strings.Contains(out[i], "//192.168.") && !strings.Contains(out[j], "//192.168.")
	})
	return out
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
