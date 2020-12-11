#ProvenDB for Oracle

ProvenDB adaptor for Oracle databases

## Build

Run `bash make.sh`

Run installProofable.sql to install neccessary tables in Oracle database

## Examples

These examples use an Oracle cloud database specified in cloud.yaml

### Monitor database for changes to nomianted tables:

```
node oracleProofable.js   --config cloud.yaml --monitor 500 
```

### Take a snapshot proof of a table

```
node oracleProofable.js   --config cloud.yaml --anchor PROOFABLEDEMO.CONTRACTSTABLE
```

### List versions of a specific ROWID:

```
node oracleProofable.js   --config cloud.yaml --listRowids AAAPWNAAAAAAATlAAR
```

### Validate the current rowid against the most recent proof:

```
node oracleProofable.js   --config cloud.yaml --validateRowid AAAPWNAAAAAAATlAAR
```

### Validate a ROWID taken at a specific SCN

```
node oracleProofable.js   --config cloud.yaml --validateRowid AAAPWNAAAAAAATlAAR.16753048658916
```

