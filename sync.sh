#scp -r `pwd` mxj@10.28.3.191:/home/mxj/work

rsync -rav -e 'ssh -p 28625' \
  --exclude '.DS_Store' \
  --exclude 'node_modules' \
  --exclude '.git' \
  . root@144.34.206.188:/work/webrtc-call
