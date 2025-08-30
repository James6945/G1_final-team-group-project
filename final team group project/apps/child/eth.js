// apps/child/eth.js
let provider, signer, contract;
const $ = (id) => document.getElementById(id);
const toWei = (v) => ethers.utils.parseUnits(String(v || 0), 'wei');
const ethToWei = (v) => ethers.utils.parseEther(String(v || 0));
const nowSec = () => Math.floor(Date.now() / 1000);

// -------- 连接钱包 & 绑定合约 ----------
async function connect() {
  if (!window.ethereum) {
    alert('MetaMask not found'); return;
  }
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  provider = new ethers.providers.Web3Provider(window.ethereum);
  const net = await provider.getNetwork();
  $('net').textContent = `${net.name} (${net.chainId})`;
  if (net.chainId !== 31337) {
    alert('请把 MetaMask 切到 Localhost 8545 (chainId 31337)'); return;
  }
  signer = provider.getSigner();
  $('addr').textContent = await signer.getAddress();

  const abi = await (await fetch('./abi.json', { cache: 'no-store' })).json();
 const addrJson = await (await fetch('./contracts_address.json', { cache: 'no-store' })).json();
const address = addrJson.SpendingLimitWallet;
contract = new ethers.Contract(address, abi, signer);
  console.log('Child connected contract', address);
}

if (window.ethereum) {
  window.ethereum.on('accountsChanged', () => location.reload());
  window.ethereum.on('chainChanged', () => location.reload());
}
window.addEventListener('DOMContentLoaded', () => {
  $('btnConnect')?.addEventListener('click', connect);
  $('btnPay')?.addEventListener('click', initiatePayment);
  $('btnTemp')?.addEventListener('click', requestTempLimit);
});
function parseDailySpentSimple(spentData) {
    const [spentWei, dayIdx] = spentData;
    // 转换为ETH
    const spentETH = ethers.utils.formatEther(spentWei);
    const dayIndex = dayIdx.toNumber();
    const date = new Date(dayIndex * 86400 * 1000).toISOString().split('T')[0];
    
    return {
        spentETH: spentETH,
        date: date
    };
}
 async function pay() {
      if (!contract) {
        showFeedback('payFeedback', 'Please connect wallet first', 'error');
        return;
      }
      
      const merchantAddress = document.getElementById('merchant').value;
      const amount = document.getElementById('amount').value;
      
      if (!merchantAddress || !amount) {
        showFeedback('payFeedback', 'Please fill all fields', 'error');
        return;
      }
      
      try {
        showFeedback('payFeedback', 'Processing payment...', 'info');
        const tx = await contract.pay(merchantAddress, {value: ethers.utils.parseEther(amount)});
        
        showFeedback('payFeedback', 'Transaction sent. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        if (receipt.status === 1) {
          showFeedback('payFeedback', 'Payment successful!', 'success');
        } else {
          showFeedback('payFeedback', 'Transaction failed', 'error');
        }
      } catch (error) {
        console.error(error);
        showFeedback('payFeedback', `Payment failed: Account has been restricted or frozen`, 'error');
      }
    }
    
    // 申请临时额度
    async function requestTempLimit() {
      if (!contract) {
        showFeedback('tempLimitFeedback', 'Please connect wallet first', 'error');
        return;
      }
      
      const amount = document.getElementById('temp').value;
      
      if (!amount) {
        showFeedback('tempLimitFeedback', 'Please enter an amount', 'error');
        return;
      }
      
      try {
        showFeedback('tempLimitFeedback', 'Requesting temporary limit...', 'info');
        const tx = await contract.requestTempLimit(ethers.utils.parseEther(amount));
        
        showFeedback('tempLimitFeedback', 'Request sent. Waiting for confirmation...', 'info');
        
        const receipt = await tx.wait();
        if (receipt.status === 1) {
          showFeedback('tempLimitFeedback', 'Limit increase requested successfully!', 'success');
        } else {
          showFeedback('tempLimitFeedback', 'Request failed', 'error');
        }
      } catch (error) {
        console.error(error);
        showFeedback('tempLimitFeedback', 'Request failed: Please check Parent address', 'error');
      }
    }
    
    // 检查每日支出
    async function check() {
      if (!contract) {
        showFeedback('result', 'Please connect wallet first', 'error');
        return;
      }
      
      try {
        showFeedback('result', 'Checking daily spending...', 'info');
        const address = await signer.getAddress();
        const dailySpent = await contract.dailySpent(address);
        const data = parseDailySpentSimple(dailySpent)
        console.log(data)
        showFeedback('result', `${data.date} spent: ${data.spentETH} ETH`, 'success');
      } catch (error) {
        console.error(error);
        showFeedback('result', 'Failed to check daily spent ', 'error');
      }
    }
    
    // 辅助函数：显示反馈消息
    function showFeedback(elementId, message, type) {
      const element = document.getElementById(elementId);
      element.innerHTML = `<i class="fas fa-${getIconName(type)}"></i> ${message}`;
      element.className = `feedback ${type}`;
      element.style.display = 'flex';
      
      // 5秒后自动清除成功/信息消息
      if (type === 'success' || type === 'info') {
        setTimeout(() => {
          element.style.display = 'none';
        }, 5000);
      }
    }
    
    function getIconName(type) {
      switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
      }
    }
    
