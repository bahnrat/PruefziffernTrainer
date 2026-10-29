package main

import (
	"os"
	"testing"
)

// Schreibt Test-QR-Codes als SVG; geprüft werden sie extern mit OpenCV.
func TestWriteSamples(t *testing.T) {
	for i, s := range []string{"http://192.168.178.20:8080", "http://10.0.0.5:8081",
		"http://192.168.2.110:8080/index.html?langer=parameter&noch=mehr&und-noch-viel-mehr-text-fuer-version-7-plus-1234567890",
		"https://example.org/abcdefghijklmnopqrstuvwxyz0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ/abcdefghijklmnopqrstuvwxyz/0123456789-xyz"} {
		q, err := Encode(s)
		if err != nil {
			t.Fatal(err)
		}
		os.WriteFile(os.Getenv("QRDIR")+"/"+string(rune('a'+i))+".svg", []byte(q.SVG(10)), 0o644)
		t.Logf("%q -> Version %d", s, q.version)
	}
}
