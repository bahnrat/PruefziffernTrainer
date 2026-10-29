package main

// Kleiner QR-Code-Erzeuger (Byte-Modus, Fehlerkorrektur M, Versionen 1–10) – genug für eine
// Adresse wie http://192.168.178.20:8080. Ohne fremde Bibliotheken, damit das Programm
// aus einer einzigen Datei besteht.

import (
	"errors"
	"fmt"
	"strings"
)

type qrVersion struct {
	ecPerBlock int
	groups     [][2]int // {Anzahl Blöcke, Datenbytes je Block}
	align      []int
}

// Fehlerkorrektur-Stufe M
var qrVersions = []qrVersion{
	{},
	{10, [][2]int{{1, 16}}, nil},
	{16, [][2]int{{1, 28}}, []int{6, 18}},
	{26, [][2]int{{1, 44}}, []int{6, 22}},
	{18, [][2]int{{2, 32}}, []int{6, 26}},
	{24, [][2]int{{2, 43}}, []int{6, 30}},
	{16, [][2]int{{4, 27}}, []int{6, 34}},
	{18, [][2]int{{4, 31}}, []int{6, 22, 38}},
	{22, [][2]int{{2, 38}, {2, 39}}, []int{6, 24, 42}},
	{22, [][2]int{{3, 36}, {2, 37}}, []int{6, 26, 46}},
	{26, [][2]int{{4, 43}, {1, 44}}, []int{6, 28, 50}},
}

func (v qrVersion) dataBytes() int {
	n := 0
	for _, g := range v.groups {
		n += g[0] * g[1]
	}
	return n
}

// ---------------------------------------------------------------- Reed-Solomon über GF(256)

var gfExp, gfLog [512]int

func init() {
	x := 1
	for i := 0; i < 255; i++ {
		gfExp[i] = x
		gfLog[x] = i
		x <<= 1
		if x&0x100 != 0 {
			x ^= 0x11D
		}
	}
	for i := 255; i < 512; i++ {
		gfExp[i] = gfExp[i-255]
	}
}

func gfMul(a, b int) int {
	if a == 0 || b == 0 {
		return 0
	}
	return gfExp[gfLog[a]+gfLog[b]]
}

func rsRemainder(data []byte, ecLen int) []byte {
	// Generatorpolynom (x - a^0)(x - a^1)…, höchster Koeffizient implizit 1
	gen := []int{1}
	for i := 0; i < ecLen; i++ {
		next := make([]int, len(gen)+1)
		for j, c := range gen {
			next[j] ^= c
			next[j+1] ^= gfMul(c, gfExp[i])
		}
		gen = next
	}
	rem := make([]int, ecLen)
	for _, b := range data {
		factor := int(b) ^ rem[0]
		copy(rem, rem[1:])
		rem[ecLen-1] = 0
		for j := 0; j < ecLen; j++ {
			rem[j] ^= gfMul(gen[j+1], factor)
		}
	}
	out := make([]byte, ecLen)
	for i, r := range rem {
		out[i] = byte(r)
	}
	return out
}

// ---------------------------------------------------------------- Kodieren

type qrCode struct {
	size    int
	mod     [][]bool
	isFunc  [][]bool
	version int
}

// Encode erzeugt den QR-Code für text (Byte-Modus, Stufe M).
func Encode(text string) (*qrCode, error) {
	data := []byte(text)
	ver := 0
	for v := 1; v <= 10; v++ {
		countBits := 8
		if v >= 10 {
			countBits = 16
		}
		if 4+countBits+8*len(data) <= qrVersions[v].dataBytes()*8 {
			ver = v
			break
		}
	}
	if ver == 0 {
		return nil, errors.New("Text zu lang für QR-Code")
	}
	vi := qrVersions[ver]
	capBits := vi.dataBytes() * 8

	// Bitstrom: Modus 0100, Länge, Daten, Abschluss, Füllbytes
	var bits []bool
	put := func(val, n int) {
		for i := n - 1; i >= 0; i-- {
			bits = append(bits, (val>>i)&1 == 1)
		}
	}
	put(4, 4)
	if ver >= 10 {
		put(len(data), 16)
	} else {
		put(len(data), 8)
	}
	for _, b := range data {
		put(int(b), 8)
	}
	for i := 0; i < 4 && len(bits) < capBits; i++ {
		bits = append(bits, false)
	}
	for len(bits)%8 != 0 {
		bits = append(bits, false)
	}
	for pad := 0xEC; len(bits) < capBits; pad ^= 0xEC ^ 0x11 {
		put(pad, 8)
	}
	codewords := make([]byte, len(bits)/8)
	for i := range codewords {
		for j := 0; j < 8; j++ {
			if bits[i*8+j] {
				codewords[i] |= 1 << (7 - j)
			}
		}
	}

	// Blöcke bilden, Fehlerkorrektur anhängen, verschränken
	var blocks, ecs [][]byte
	pos := 0
	for _, g := range vi.groups {
		for b := 0; b < g[0]; b++ {
			blk := codewords[pos : pos+g[1]]
			pos += g[1]
			blocks = append(blocks, blk)
			ecs = append(ecs, rsRemainder(blk, vi.ecPerBlock))
		}
	}
	var final []byte
	for i := 0; ; i++ {
		any := false
		for _, blk := range blocks {
			if i < len(blk) {
				final = append(final, blk[i])
				any = true
			}
		}
		if !any {
			break
		}
	}
	for i := 0; i < vi.ecPerBlock; i++ {
		for _, ec := range ecs {
			final = append(final, ec[i])
		}
	}

	q := newQR(ver)
	q.drawFunctionPatterns()
	q.drawCodewords(final)

	best, bestPenalty := 0, -1
	for m := 0; m < 8; m++ {
		q.applyMask(m)
		q.drawFormat(m)
		p := q.penalty()
		if bestPenalty < 0 || p < bestPenalty {
			best, bestPenalty = m, p
		}
		q.applyMask(m) // zurücknehmen
	}
	q.applyMask(best)
	q.drawFormat(best)
	return q, nil
}

func newQR(ver int) *qrCode {
	size := ver*4 + 17
	q := &qrCode{size: size, version: ver}
	q.mod = make([][]bool, size)
	q.isFunc = make([][]bool, size)
	for i := range q.mod {
		q.mod[i] = make([]bool, size)
		q.isFunc[i] = make([]bool, size)
	}
	return q
}

func (q *qrCode) set(x, y int, dark bool) {
	q.mod[y][x] = dark
	q.isFunc[y][x] = true
}

func (q *qrCode) drawFunctionPatterns() {
	n := q.size
	for i := 0; i < n; i++ { // Taktlinien
		q.set(6, i, i%2 == 0)
		q.set(i, 6, i%2 == 0)
	}
	for _, c := range [][2]int{{3, 3}, {n - 4, 3}, {3, n - 4}} { // Suchmuster mit Trennrand
		for dy := -4; dy <= 4; dy++ {
			for dx := -4; dx <= 4; dx++ {
				x, y := c[0]+dx, c[1]+dy
				if x < 0 || y < 0 || x >= n || y >= n {
					continue
				}
				d := max(abs(dx), abs(dy))
				q.set(x, y, d != 2 && d != 4)
			}
		}
	}
	al := qrVersions[q.version].align
	for i, ax := range al { // Ausrichtungsmuster
		for j, ay := range al {
			if (i == 0 && j == 0) || (i == 0 && j == len(al)-1) || (i == len(al)-1 && j == 0) {
				continue
			}
			for dy := -2; dy <= 2; dy++ {
				for dx := -2; dx <= 2; dx++ {
					q.set(ax+dx, ay+dy, max(abs(dx), abs(dy)) != 1)
				}
			}
		}
	}
	q.drawFormat(0) // Platz reservieren
	if q.version >= 7 {
		rem := q.version
		for i := 0; i < 12; i++ {
			rem = (rem << 1) ^ ((rem >> 11) * 0x1F25)
		}
		bits := q.version<<12 | rem
		for i := 0; i < 18; i++ {
			bit := (bits>>i)&1 == 1
			a, b := n-11+i%3, i/3
			q.set(a, b, bit)
			q.set(b, a, bit)
		}
	}
}

func (q *qrCode) drawFormat(mask int) {
	data := 0<<3 | mask // Stufe M = 00
	rem := data
	for i := 0; i < 10; i++ {
		rem = (rem << 1) ^ ((rem >> 9) * 0x537)
	}
	bits := (data<<10 | rem) ^ 0x5412
	bit := func(i int) bool { return (bits>>i)&1 == 1 }
	n := q.size
	for i := 0; i <= 5; i++ {
		q.set(8, i, bit(i))
	}
	q.set(8, 7, bit(6))
	q.set(8, 8, bit(7))
	q.set(7, 8, bit(8))
	for i := 9; i < 15; i++ {
		q.set(14-i, 8, bit(i))
	}
	for i := 0; i < 8; i++ {
		q.set(n-1-i, 8, bit(i))
	}
	for i := 8; i < 15; i++ {
		q.set(8, n-15+i, bit(i))
	}
	q.set(8, n-8, true) // dunkles Modul
}

func (q *qrCode) drawCodewords(data []byte) {
	n := q.size
	i := 0
	for right := n - 1; right >= 1; right -= 2 {
		if right == 6 {
			right = 5
		}
		for vert := 0; vert < n; vert++ {
			for j := 0; j < 2; j++ {
				x := right - j
				y := vert
				if (right+1)&2 == 0 {
					y = n - 1 - vert
				}
				if !q.isFunc[y][x] && i < len(data)*8 {
					q.mod[y][x] = (data[i>>3]>>(7-uint(i&7)))&1 == 1
					i++
				}
			}
		}
	}
}

func (q *qrCode) applyMask(m int) {
	for y := 0; y < q.size; y++ {
		for x := 0; x < q.size; x++ {
			if q.isFunc[y][x] {
				continue
			}
			var inv bool
			switch m {
			case 0:
				inv = (x+y)%2 == 0
			case 1:
				inv = y%2 == 0
			case 2:
				inv = x%3 == 0
			case 3:
				inv = (x+y)%3 == 0
			case 4:
				inv = (x/3+y/2)%2 == 0
			case 5:
				inv = x*y%2+x*y%3 == 0
			case 6:
				inv = (x*y%2+x*y%3)%2 == 0
			default:
				inv = ((x+y)%2+x*y%3)%2 == 0
			}
			if inv {
				q.mod[y][x] = !q.mod[y][x]
			}
		}
	}
}

// Vereinfachte Bewertung (Läufe, 2×2-Flächen, Hell-Dunkel-Verhältnis) zur Maskenwahl.
func (q *qrCode) penalty() int {
	n, p, dark := q.size, 0, 0
	for y := 0; y < n; y++ {
		for _, horiz := range []bool{true, false} {
			run, last := 0, false
			for x := 0; x < n; x++ {
				c := q.mod[y][x]
				if !horiz {
					c = q.mod[x][y]
				}
				if x > 0 && c == last {
					run++
				} else {
					if run >= 5 {
						p += run - 2
					}
					run = 1
				}
				last = c
			}
			if run >= 5 {
				p += run - 2
			}
		}
		for x := 0; x < n; x++ {
			if q.mod[y][x] {
				dark++
			}
			if x < n-1 && y < n-1 {
				c := q.mod[y][x]
				if c == q.mod[y][x+1] && c == q.mod[y+1][x] && c == q.mod[y+1][x+1] {
					p += 3
				}
			}
		}
	}
	p += abs(dark*20-n*n*10) / (n * n) * 10
	return p
}

// ---------------------------------------------------------------- Ausgabe

func (q *qrCode) SVG(scale int) string {
	border := 4
	dim := (q.size + 2*border) * scale
	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" shape-rendering="crispEdges">`, dim, dim, q.size+2*border, q.size+2*border)
	fmt.Fprintf(&b, `<rect width="100%%" height="100%%" fill="#fff"/><path fill="#000" d="`)
	for y := 0; y < q.size; y++ {
		for x := 0; x < q.size; x++ {
			if q.mod[y][x] {
				fmt.Fprintf(&b, "M%d %dh1v1h-1z", x+border, y+border)
			}
		}
	}
	b.WriteString(`"/></svg>`)
	return b.String()
}

// Terminal: zwei Modulzeilen je Textzeile mit Halbblöcken, dunkel auf hell.
func (q *qrCode) Terminal() string {
	border := 2
	n := q.size + 2*border
	at := func(x, y int) bool {
		x, y = x-border, y-border
		return x >= 0 && y >= 0 && x < q.size && y < q.size && q.mod[y][x]
	}
	var b strings.Builder
	for y := 0; y < n; y += 2 {
		b.WriteString("  ")
		for x := 0; x < n; x++ {
			top, bot := at(x, y), at(x, y+1)
			switch {
			case top && bot:
				b.WriteString(" ")
			case top:
				b.WriteString("▄")
			case bot:
				b.WriteString("▀")
			default:
				b.WriteString("█")
			}
		}
		b.WriteString("\n")
	}
	return b.String()
}

func abs(a int) int {
	if a < 0 {
		return -a
	}
	return a
}
