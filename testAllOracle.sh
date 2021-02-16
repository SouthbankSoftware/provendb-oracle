cat ~/bin/oracle-envs.txt|tail -1| while read LINE;do
    export P4O_ORACLE_SERVER=`echo $LINE|cut -f1 -d','`
    export P4O_ORACLE_USERNAME=`echo $LINE|cut -f2 -d','`
    export P4O_ORACLE_PASSWORD=`echo $LINE|cut -f3 -d','`
    export P4O_NAME=`echo $LINE|cut -f4 -d','`
    echo "============================================="
    echo "Environment ${P4O_NAME}"
    echo "============================================="
    env |grep P4O
    bash runTestsInOrder.sh
done