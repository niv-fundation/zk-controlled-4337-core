import { ethers } from "hardhat";

import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { EntryPointSimulations, SmartAccount, SmartAccount__factory } from "@ethers-v6";
import { PackedUserOperationStruct } from "@/generated-types/ethers/@account-abstraction/contracts/core/EntryPoint";

export async function executeViaEntryPoint(
  entryPoint: EntryPointSimulations,
  account: SmartAccount,
  signer: SignerWithAddress,
  destination: string,
  data: string,
  value: bigint,
) {
  if ((await ethers.provider.getBalance(await account.getAddress())) === 0n) {
    await setBalance(await account.getAddress(), ethers.parseEther("20"));
  }

  const verificationGasLimit = 16777216n;
  const callGasLimit = verificationGasLimit;
  const maxPriorityFeePerGas = 256n;
  const maxFeePerGas = maxPriorityFeePerGas;

  const userOp: PackedUserOperationStruct = {
    sender: await account.getAddress(),
    nonce: await account.getCurrentNonce(),
    initCode: "0x",
    callData: SmartAccount__factory.createInterface().encodeFunctionData("execute(address,uint256,bytes)", [
      destination,
      value,
      data,
    ]),
    accountGasLimits: ethers.toBeHex((BigInt(verificationGasLimit) << 128n) | BigInt(callGasLimit), 32),
    preVerificationGas: verificationGasLimit,
    gasFees: ethers.toBeHex((BigInt(maxPriorityFeePerGas) << 128n) | BigInt(maxFeePerGas), 32),
    paymasterAndData: "0x",
    signature: "0x",
  };

  const userOpHash = await entryPoint.getUserOpHash(userOp);

  userOp.signature = await signer.signMessage(userOpHash);

  const [sender] = await ethers.getSigners();

  await entryPoint.handleOps([userOp], await sender.getAddress());
}
