package main

import "syscall"

// Windows-Konsole auf UTF-8 umstellen, damit Umlaute und der QR-Code richtig erscheinen.
func consoleUTF8() {
	k := syscall.NewLazyDLL("kernel32.dll")
	k.NewProc("SetConsoleOutputCP").Call(65001)
	k.NewProc("SetConsoleCP").Call(65001)
}
