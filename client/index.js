let socket = null;
let peerConn = null;
let localStream = null;
let chatChannel = null;

let socketConnectProm = null;
let socketConnectPromResolve = null;
let socketConnectPromReject = null;

function isString(x) {
  return Object.prototype.toString.call(x) === "[object String]"
}


new Vue({
  data: {
    title: 'test-webrtc',
    socketConnected: false,
    isChatChannelOpen: false,
    role: '',
    chatText: '',
    logTxt: '',
    connState: 'Peer',
    iceConnState: 'Ice',
  },
  computed: {
    peerConnected() {
      return this.connState === 'connected';
    },
    iceConnected() {
      return this.iceConnState === 'connected';
    }
  },
  created() {
    window.addEventListener('error', evt => {
      this.log('Global error: ' + evt);
    });
  },
  mounted() {
  },
  methods: {
    log(str) {
      console.log(str);
      if (!isString(str)) {
        try {
          str = JSON.stringify(str, null, '  ');
        } catch (ex) {
          str = str + '';
        }
      }
      this.logTxt += str + '\n';
    },
    connect() {
      let server = 'https://zytest2.mxj.mx';
      let options = {
        path: '/socketproxy/socket.io',
      };
      if (location.search.indexOf('no-socket-proxy') >= 0) {
        server = 'http://localhost:9000'
        options = {};
      }
      socket = io.connect(server, options);
      socket.on('connect', () => {
        socketConnectPromResolve();
        this.socketConnected = true;
      });
      socket.on('disconnect', () => {
        this.socketConnected = false;
      });
      socket.on('host', () => {
        this.log('received host');
        this.onJoinResult('host');
      });
      socket.on('guest', () => {
        this.log('received guest');
        this.onJoinResult('guest');
      });
      socket.on('full', () => {
        this.log('received full');
        this.onJoinResult(new Error('Room is full'));
      });
      socket.on('ready', () => {
        this.log('received ready');
        this.onJoinReady();
      });
      socket.on('bye', () => {
        this.log('received bye');
        this.onBye();
      });
      socket.on('message', (payload) => {
        this.log('>>>>> received message:');
        this.log(payload);
        this.log('-----');
        this.receivedMessage(payload);
      });
    },
    disconnect() {
      socket.disconnect();
    },
    sendChat() {
      chatChannel.send(this.chatText);
      this.chatText = '';
    },
    sendJoin() {
      this.log('>>>>> send join -----');
      socket.emit('join');
    },
    sendBye() {
      this.log('>>>>> send bye -----');
      socket.emit('bye');
    },
    sendMessage(payload) {
      this.log('>>>>> send message:');
      this.log(payload);
      this.log('-----');
      socket.emit('message', payload);
    },
    async receivedMessage(payload) {
      if (payload.type === 'offer') {
        await peerConn.setRemoteDescription({
          type: 'offer',
          sdp: payload.sdp,
        });
        const desc = await peerConn.createAnswer();
        peerConn.setLocalDescription(desc);
        this.sendMessage({
          type: 'answer',
          sdp: desc.sdp,
        });

      } else if (payload.type === 'answer') {
        peerConn.setRemoteDescription({
          type: 'answer',
          sdp: payload.sdp,
        });

      } else if (payload.type === 'candidate') {
        await peerConn.addIceCandidate({
          candidate: payload.candidate,
        });
      }
    },
    async listenPeerConnectionEvent() {
      peerConn.onicecandidate = (evt) => {
        this.log('onicecandidate');
        if (event.candidate) {
          this.sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
          });
        } else {
          this.log('End of candidates.');
        }
      };
      peerConn.onaddstream = (evt) => {
        this.log('onaddstream');
        this.$refs.remoteVideo.srcObject = evt.stream;
      };
      peerConn.ondatachannel = (evt) => {
        chatChannel = evt.channel;
        this.listenChatChannelEvent();
      };
      peerConn.onconnectionstatechange = (evt) => {
        this.connState = evt.currentTarget.connectionState;
      };
      peerConn.oniceconnectionstatechange = (evt) => {
        this.iceConnState = evt.currentTarget.iceConnectionState;
      };
    },
    async listenChatChannelEvent() {
      chatChannel.onopen = () => {
        this.isChatChannelOpen = true;
      };
      chatChannel.onclose = () => {
        this.isChatChannelOpen = false;
      };
      chatChannel.onmessage = (evt) => {
        this.log('>>>>> data channel received:');
        this.log(evt.data);
        this.log('-----');
      };
    },
    async createPeerConnAndOpenCamera() {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
      });
      this.$refs.localVideo.srcObject = localStream;
      peerConn = new RTCPeerConnection({
        iceServers: [
          {
            urls: 'turn:144.34.206.188',
            credential: 'hello',
            username: 'hello',
          }
        ],
      });
      localStream.getTracks().forEach(track => {
        peerConn.addTrack(track, localStream);
      });
    },
    async destroyConnection() {
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
        });
        localStream = null;
      }
      if (peerConn) {
        peerConn.close();
        peerConn = null;
      }
      this.$refs.localVideo.srcObject = null;
      this.$refs.remoteVideo.srcObject = null;
    },
    async connectSocket() {
      socketConnectProm = new Promise((resolve, reject) => {
        socketConnectPromResolve = resolve;
        socketConnectPromReject = reject;
      });
      this.connect();
      await socketConnectProm;
    },
    async join() {
      await this.connectSocket();
      await this.createPeerConnAndOpenCamera();
      this.listenPeerConnectionEvent();
      joinProm = new Promise((resolve, reject) => {
        joinPromResolve = resolve;
        joinPromReject = reject;
      });
      this.sendJoin();
    },
    async onJoinResult(role) {
      if (role instanceof Error) {
        this.destroyConnection();
        window.alert(role);
        return;
      }
      this.role = role;
      if (this.role === 'host') {
        // createDataChannel must before createOffer:
        chatChannel = peerConn.createDataChannel('chat');
        this.listenChatChannelEvent();
      } else {
      }
    },
    async onJoinReady() {
      if (this.role === 'host') {
        const desc = await peerConn.createOffer();
        peerConn.setLocalDescription(desc);
        this.sendMessage({
          type: 'offer',
          sdp: desc.sdp,
        });
      }
    },
    async hangup() {
      this.sendBye();
    },
    async onBye() {
      this.destroyConnection();
      socket.disconnect();
    },
    onRemoteVideoLoadedmetadata(evt) {
      this.$refs.remoteVideo.play();
    },
    onLocalVideoLoadedmetadata(evt) {
      this.$refs.localVideo.play();
    },
  }
}).$mount('#app');
