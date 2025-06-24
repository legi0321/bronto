
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const {
  RPC_URL,
  PRIVATE_KEYS,
  ROUTER_ADDRESS,
  ROUTES
} = process.env;

const args = process.argv.slice(2); // ambil argumen dari terminal
const AMOUNT_TO_SWAP = args[0] || "0.003";       // default: 0.003
const SWAP_COUNT = Number(args[1]) || 2;         // default: 2 swap
const DELAY_MS = Number(args[2]) || 3000;        // default: 3 detik

console.log(`⚙️  AMOUNT: ${AMOUNT_TO_SWAP} | COUNT: ${SWAP_COUNT} | DELAY: ${DELAY_MS}ms`);

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const privateKeys = PRIVATE_KEYS.split(",");
const routePairs = ROUTES.split(",").map(pair => pair.split(">"));

const ROUTER_ABI = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory)",
];
const ERC20_ABI = [
  "function approve(address spender, uint amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint)",
  "function balanceOf(address account) external view returns (uint)",
  "function decimals() external view returns (uint8)"
];

const delay = ms => new Promise(res => setTimeout(res, ms));

async function performSwap(wallet, router, tokenIn, tokenOut) {
  const decimals = await tokenIn.decimals();
  const amountIn = ethers.utils.parseUnits(AMOUNT_TO_SWAP, decimals);
  const minAmountOut = 0;

  const balance = await tokenIn.balanceOf(wallet.address);
  if (balance.lt(amountIn)) {
    console.log(`⛔ [${wallet.address}] Saldo tidak cukup (${ethers.utils.formatUnits(balance, decimals)})`);
    return;
  }

  const allowance = await tokenIn.allowance(wallet.address, router.address);
  if (allowance.lt(amountIn)) {
    console.log(`🔓 [${wallet.address}] Approving token...`);
    const approveTx = await tokenIn.approve(router.address, ethers.constants.MaxUint256);
    await approveTx.wait();
    console.log(`✅ [${wallet.address}] Token approved`);
  }

  const path = [tokenIn.address, tokenOut.address];
  const deadline = Math.floor(Date.now() / 1000) + 1800;

  try {
    const tx = await router.swapExactTokensForTokens(
      amountIn,
      minAmountOut,
      path,
      wallet.address,
      deadline,
      { gasLimit: 300000 }
    );
    console.log(`🔁 [${wallet.address}] Swap ${AMOUNT_TO_SWAP} sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Swap sukses di blok ${receipt.blockNumber}`);
  } catch (err) {
    console.error(`❌ Gagal swap:`, err.message);
  }
}

async function main() {
  for (const pk of privateKeys) {
    const wallet = new ethers.Wallet(pk, provider);
    console.log(`\n🔐 Akun: ${wallet.address}`);
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);

    for (const [tokenInAddr, tokenOutAddr] of routePairs) {
      const tokenIn = new ethers.Contract(tokenInAddr, ERC20_ABI, wallet);
      const tokenOut = new ethers.Contract(tokenOutAddr, ERC20_ABI, wallet);

      for (let i = 0; i < SWAP_COUNT; i++) {
        console.log(`\n🚀 Swap ${tokenInAddr} ➝ ${tokenOutAddr} ke-${i + 1}`);
        await performSwap(wallet, router, tokenIn, tokenOut);
        await delay(DELAY_MS);
      }
    }
  }
}

main().catch(console.error);
