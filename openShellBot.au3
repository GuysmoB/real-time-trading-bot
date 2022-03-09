#include <Array.au3>
#include <File.au3>
#include <MsgBoxConstants.au3>
#include <AutoItConstants.au3>
AutoItSetOption('MouseCoordMode', 0)
AutoItSetOption('PixelCoordMode', 0)
AutoItSetOption('WinTitleMatchMode', 2)
HotKeySet("{ESC}", "_Exit")

Global $ticker[2] = ["BULL", "BEAR"]
Global $tf[2] = [1, 2];, 3, 4, 5];, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

sendCommande("npm run compile")
Sleep(10000)
For $j In $ticker
	For $i In $tf
		sendCommande("node dist/app.js " &$j &" " &$i)
	Next
Next


Func sendCommande($commande)
	Run("powershell")
	WinWait("[TITLE:Windows PowerShell]", "", 10)
	Sleep(500)
	ClipPut("")
	logInfo($commande)
	ClipPut($commande)
	Send("^v")
	Send("{ENTER}")
	Sleep(1000)
EndFunc   ;==>_winActivate


;-----------------------------------------------
; # _winActivate Function
;-----------------------------------------------
Func _winActivate($focus)
	If (WinActivate($focus) == 0) Then
		logError("Can't activate window : " & $focus)
		_Exit()
	EndIf
EndFunc   ;==>_winActivate


;-----------------------------------------------
; # _winMove Function
;-----------------------------------------------
Func _winMove($focus, $x, $y, $w, $l)
	If (WinMove($focus, "", $x, $y, $w, $l) == 0) Then
		logError("Can't move window : " & $focus)
		_Exit()
	EndIf
EndFunc   ;==>_winMove


;-----------------------------------------------
; # _winSetState Function
;-----------------------------------------------
Func _winSetState($focus, $flag)
	If (WinSetState($focus, "", $flag) == 0) Then
		logError("Can't set window : " & $focus &" with flag : " &$flag)
		_Exit()
	EndIf
EndFunc   ;==>_winSetState


;-----------------------------------------------
; # logInfo Function
;-----------------------------------------------
Func logInfo($text)
	logPrint("[INFO] " & $text & @CRLF)
EndFunc   ;==>logInfo


;-----------------------------------------------
; # logError Function
;-----------------------------------------------
Func logError($text)
	logPrint("[ERROR] " & $text & @CRLF)
EndFunc   ;==>logError


;-----------------------------------------------
; # Exit Function
;-----------------------------------------------
Func _Exit()
	logInfo("Script stopped")
	Exit
EndFunc   ;==>_Exit


;-----------------------------------------------
; # logPrint Function
;-----------------------------------------------
Func logPrint($text)
	_FileWriteLog(@DesktopDir & "\BC-bot.log", $text)
	ConsoleWrite(@MON & "/" & @MDAY & "/" & @YEAR & " " & @HOUR & ":" & @MIN & ":" & @SEC & " " & $text & @CRLF)
EndFunc   ;==>logPrint



