ls test/*.test.js|while read line; do
  yarn test${1} $line 2>&1 |tee -a runTestsInOrder.log
done