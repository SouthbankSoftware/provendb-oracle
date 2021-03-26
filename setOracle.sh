if [ $# -eq 0 ]; then
    cat ~/bin/oracle-envs.txt
else
grep ",${1}\$" ~/bin/oracle-envs.txt|while read LINE;do
    export P4O_ORACLE_SERVER=`echo $LINE|cut -f1 -d','`
    export P4O_ORACLE_USERNAME=`echo $LINE|cut -f2 -d','`
    export P4O_ORACLE_PASSWORD=`echo $LINE|cut -f3 -d','`
    export P4O_NAME=`echo $LINE|cut -f4 -d','`
    echo "============================================="
    echo "Environment ${P4O_NAME}"
    echo "============================================="
done
fi
