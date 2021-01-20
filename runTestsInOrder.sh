ls test/*.test.js|while read line; do
  yarn test${1} $line 
done