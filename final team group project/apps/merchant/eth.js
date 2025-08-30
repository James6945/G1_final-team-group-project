// apps/merchant/eth.js
let provider, signer, contract;
const $ = (id) => document.getElementById(id);
const toWei = (v) => ethers.utils.parseUnits(String(v || 0), 'wei');
const ethToWei = (v) => ethers.utils.parseEther(String(v || 0));

async function connect() {
  if (!window.ethereum) { alert('MetaMask not found'); return; }
  await window.ethereum.request({ method: 'eth_requestAccounts' });

  provider = new ethers.providers.Web3Provider(window.ethereum);
  const net = await provider.getNetwork();
  console.log(net)
  $('net').textContent = `${net.name} (${net.chainId})`;
  if (net.chainId !== 31337) {
    alert('请把 MetaMask 切到 Localhost 8545 (chainId 31337)'); return;
  }

  signer = provider.getSigner();
  const addr = await signer.getAddress();
  $('addr').textContent = addr;
  $('merchantAddr') && ($('merchantAddr').value = addr); // 可把商户地址自动回填

  const abi = await (await fetch('./abi.json', { cache: 'no-store' })).json();
  const { address } = await (await fetch('./contracts_address.json', { cache: 'no-store' })).json();
  contract = new ethers.Contract(address, abi, signer);
  console.log('Merchant connected contract', address);
}

if (window.ethereum) {
  window.ethereum.on('accountsChanged', () => location.reload());
  window.ethereum.on('chainChanged', () => location.reload());
}
window.addEventListener('DOMContentLoaded', () => {
  $('btnConnect')?.addEventListener('click', connect);
  $('btnPrecheck')?.addEventListener('click', precheck);
  $('btnCheckWL')?.addEventListener('click', checkWhitelist);
});
