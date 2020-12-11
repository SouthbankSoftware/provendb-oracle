bin/run anchor --config=conf/cloud.yaml --tables=PROOFABLEDEMO.CONTRACTSTABLE

bin/run monitor --config=conf/cloud.yaml --interval=500

bin/run history  --config=conf/cloud.yaml  --rowId AAAPWNAAAAAAATkAAA

bin/run validate  --config=conf/cloud.yaml --rowId=AAAPWNAAAAAAATkAAA.16753633198978

sqlplus system/DBEnvy2016@//localhost:1521/orclpdb.internal.cloudapp.net

