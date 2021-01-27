cp node_modules\oracledb\build\Release\oracledb-5.1.0-win32-x64.node dist
pkg --out-path dist -t node12-win . 
cd dist
"c:\program files\7-zip\7z" a -y  provendb-oracle-windows.zip provendb-oracle.exe oracledb-5.1.0-win32-x64.node