import { ethers } from "hardhat";

import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { EntryPoint, SmartAccount, SmartAccount__factory, SmartAccountFactory } from "@ethers-v6";
import { PackedUserOperationStruct } from "@/generated-types/ethers/@account-abstraction/contracts/core/EntryPoint";

export async function executeViaEntryPoint(
  entryPoint: EntryPoint,
  account: SmartAccount,
  signer: SignerWithAddress,
  destination: string,
  data: string,
  value: bigint,
) {
  if ((await ethers.provider.getBalance(await account.getAddress())) === 0n) {
    await setBalance(await account.getAddress(), ethers.parseEther("20"));
  }

  const userOp = await getDefaultPackedUserOperation(account);
  userOp.callData = SmartAccount__factory.createInterface().encodeFunctionData("execute(address,uint256,bytes)", [
    destination,
    value,
    data,
  ]);

  const userOpHash = await entryPoint.getUserOpHash(userOp);
  userOp.signature = await ethers.provider.send("eth_sign", [signer.address.toLowerCase(), userOpHash]);

  await sendSignedPackedUserOperation(entryPoint, userOp);
}

export async function getInitCode(accountFactory: SmartAccountFactory, ownerAddress: string) {
  const initCode = ethers.concat([
    await accountFactory.getAddress(),
    accountFactory.interface.encodeFunctionData("deploySmartAccount(address)", [ownerAddress]),
  ]);

  const predictedAddress = await accountFactory.predictSmartAccountAddress(ownerAddress);

  return { initCode, predictedAddress };
}

export async function getEmptyPackedUserOperation() {
  const verificationGasLimit = 16777216n;
  const callGasLimit = verificationGasLimit;
  const maxPriorityFeePerGas = 256n;
  const maxFeePerGas = maxPriorityFeePerGas;

  return {
    sender: ethers.ZeroAddress,
    nonce: 0n,
    initCode: "0x",
    callData: "0x",
    accountGasLimits: ethers.toBeHex((BigInt(verificationGasLimit) << 128n) | BigInt(callGasLimit), 32),
    preVerificationGas: verificationGasLimit,
    gasFees: ethers.toBeHex((BigInt(maxPriorityFeePerGas) << 128n) | BigInt(maxFeePerGas), 32),
    paymasterAndData: "0x",
    signature: "0x",
  };
}

export async function getDefaultPackedUserOperation(account: SmartAccount) {
  const emptyUserOp = await getEmptyPackedUserOperation();

  emptyUserOp.sender = await account.getAddress();
  emptyUserOp.nonce = await account.getCurrentNonce();

  return emptyUserOp;
}

export async function getSignedPackedUserOperation(
  entryPoint: EntryPoint,
  signer: SignerWithAddress,
  userOp: PackedUserOperationStruct,
) {
  const userOpHash = await entryPoint.getUserOpHash(userOp);
  userOp.signature = await ethers.provider.send("eth_sign", [signer.address.toLowerCase(), userOpHash]);

  return userOp;
}

export async function sendSignedPackedUserOperation(entryPoint: EntryPoint, userOp: PackedUserOperationStruct) {
  const [sender] = await ethers.getSigners();
  await entryPoint.handleOps([userOp], await sender.getAddress());
}
