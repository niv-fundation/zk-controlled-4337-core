import { expect } from "chai";
import { ethers, zkit } from "hardhat";

import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

import { Reverter } from "@test-helpers";
import { deployAA, deployEntryPoint } from "@deployment";

import { EntryPoint, Paymaster, SmartAccount, SmartAccount__factory, SmartAccountFactory } from "@ethers-v6";
import {
  executeViaEntryPoint,
  getDefaultPackedUserOperation,
  getEmptyPackedUserOperation,
  getInitCode,
  getSignature,
  getSignedPackedUserOperation,
  sendSignedPackedUserOperation,
} from "@/test/helpers/aa-helper";
import { getInterfaceID } from "@solarity/hardhat-habits";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { buildNullifier, poseidonHash } from "@scripts";
import { IdentityAuth } from "@/generated-types/zkit";

describe("SmartAccount", () => {
  const reverter = new Reverter();

  const EVENT_ID = 5n;

  let OWNER: SignerWithAddress;
  let SECOND: SignerWithAddress;

  let entryPoint: EntryPoint;
  let accountFactory: SmartAccountFactory;

  let account: SmartAccount;
  let paymaster: Paymaster;

  let identityAuth: IdentityAuth;

  let privateKey: bigint;
  let secondPrivateKey: bigint;

  let accountNullifier: string;
  let secondNullifier: string;

  before(async () => {
    identityAuth = await zkit.getCircuit("IdentityAuth");

    [OWNER, SECOND] = await ethers.getSigners();

    entryPoint = await deployEntryPoint();
    accountFactory = await deployAA(entryPoint);

    privateKey = BigInt(poseidonHash("0xbade288099ca7c293346a3e88606384b3f1c875ad76d9313840f35c49723554c")) >> 3n;
    secondPrivateKey = BigInt(poseidonHash("0xbade288099ca7c293346a3e88606384b3f1c875ad76d9313840f35c49723554f")) >> 3n;

    accountNullifier = buildNullifier(privateKey, EVENT_ID);
    secondNullifier = buildNullifier(secondPrivateKey, EVENT_ID);

    await accountFactory.deploySmartAccount(accountNullifier);
    account = await ethers.getContractAt("SmartAccount", await accountFactory.getSmartAccount(accountNullifier));

    const Paymaster = await ethers.getContractFactory("Paymaster");
    paymaster = await Paymaster.deploy(await entryPoint.getAddress());

    await setBalance(await account.getAddress(), ethers.parseEther("20"));
    await setBalance(await paymaster.getAddress(), ethers.parseEther("20"));

    await paymaster.deposit({ value: ethers.parseEther("20") });

    await reverter.snapshot();
  });

  afterEach(reverter.revert);

  describe("#Smart Account Factory", () => {
    it("should deploy a smart account and emit deployment event", async () => {
      const expectedAddress = await accountFactory.predictSmartAccountAddress(secondNullifier);

      await expect(accountFactory.deploySmartAccount(secondNullifier))
        .to.emit(accountFactory, "SmartAccountDeployed")
        .withArgs(expectedAddress);

      expect(await accountFactory.getSmartAccount(secondNullifier)).to.eq(expectedAddress);
    });

    it("should set new Smart Account implementation only by owner", async () => {
      const currentImplementation = await accountFactory.getSmartAccountImplementation();

      const SmartAccount = await ethers.getContractFactory("SmartAccount");
      const newImplementation = await SmartAccount.deploy(ethers.ZeroAddress, ethers.ZeroAddress);

      await expect(accountFactory.connect(SECOND).setSmartAccountImplementation(await newImplementation.getAddress()))
        .to.be.revertedWithCustomError(accountFactory, "OwnableUnauthorizedAccount")
        .withArgs(SECOND.address);

      await accountFactory.setSmartAccountImplementation(await newImplementation.getAddress());

      expect(await accountFactory.getSmartAccountImplementation()).to.eq(await newImplementation.getAddress());
      expect(await accountFactory.getSmartAccountImplementation()).to.not.eq(currentImplementation);
    });

    it("should upgrade Smart Account Factory implementation only by owner", async () => {
      const currentImplementation = await accountFactory.implementation();

      const SmartAccountFactory = await ethers.getContractFactory("SmartAccountFactory");
      const newImplementation = await SmartAccountFactory.deploy();

      await expect(accountFactory.connect(SECOND).upgradeToAndCall(await newImplementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(accountFactory, "OwnableUnauthorizedAccount")
        .withArgs(SECOND.address);

      await accountFactory.upgradeToAndCall(await newImplementation.getAddress(), "0x");

      expect(await accountFactory.implementation()).to.eq(await newImplementation.getAddress());
      expect(await accountFactory.implementation()).to.not.eq(currentImplementation);
    });

    it("should revert if trying to initialize factory twice", async () => {
      await expect(accountFactory.__SmartAccountFactory_init(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        accountFactory,
        "InvalidInitialization",
      );
    });
  });

  describe("#Smart Account", () => {
    it("should call the destination contract through the entrypoint and revert if call is failing", async () => {
      await executeViaEntryPoint(
        entryPoint,
        account,
        paymaster,
        privateKey,
        EVENT_ID,
        await accountFactory.getAddress(),
        accountFactory.interface.encodeFunctionData("deploySmartAccount", [secondNullifier]),
        0n,
      );

      const signature = await getSignature(privateKey, EVENT_ID, OWNER.address);

      await account.setSessionAccount(OWNER.address, signature);

      await expect(
        account.execute(
          await accountFactory.getAddress(),
          0n,
          accountFactory.interface.encodeFunctionData("deploySmartAccount", [secondNullifier]),
        ),
      )
        .to.be.revertedWithCustomError(account, "CallFailed")
        .withArgs("0x");
    });

    it("should revert if trying to set invalid session account", async () => {
      const signature = await getSignature(privateKey, EVENT_ID, OWNER.address);

      await expect(account.setSessionAccount(SECOND.address, signature)).to.be.revertedWithCustomError(
        account,
        "InvalidProof",
      );
    });

    it("should revert if trying to call account not from owner or entry point", async () => {
      await expect(
        account
          .connect(SECOND)
          .execute(
            await accountFactory.getAddress(),
            0n,
            accountFactory.interface.encodeFunctionData("deploySmartAccount", [secondNullifier]),
          ),
      )
        .to.be.revertedWithCustomError(account, "NotFromEntryPointOrOwner")
        .withArgs(SECOND.address);
    });

    it("should revert if signer is invalid", async () => {
      await expect(
        executeViaEntryPoint(
          entryPoint,
          account,
          paymaster,
          secondPrivateKey,
          EVENT_ID,
          await accountFactory.getAddress(),
          accountFactory.interface.encodeFunctionData("deploySmartAccount", [secondNullifier]),
          0n,
        ),
      )
        .to.be.revertedWithCustomError(entryPoint, "FailedOp")
        .withArgs(0, "AA24 signature error");
    });

    it("should deploy account and execute operation", async () => {
      const ERC20 = await ethers.getContractFactory("ERC20Mock");
      const token = await ERC20.deploy("Token", "TKN", 18);

      const userOperation = await getEmptyPackedUserOperation();
      const initCode = await getInitCode(accountFactory, secondNullifier);

      await setBalance(initCode.predictedAddress, ethers.parseEther("20"));

      userOperation.sender = initCode.predictedAddress;
      userOperation.initCode = initCode.initCode;

      userOperation.callData = SmartAccount__factory.createInterface().encodeFunctionData(
        "execute(address,uint256,bytes)",
        [
          await token.getAddress(),
          0n,
          token.interface.encodeFunctionData("mint(address,uint256)", [initCode.predictedAddress, 1000n]),
        ],
      );

      const signedOp = await getSignedPackedUserOperation(entryPoint, secondPrivateKey, EVENT_ID, userOperation);

      await sendSignedPackedUserOperation(entryPoint, signedOp);

      const account = await ethers.getContractAt("SmartAccount", initCode.predictedAddress);

      expect(await token.balanceOf(initCode.predictedAddress)).to.eq(1000n);
      expect((await account.getTransactionHistory(0, 10)).length).to.eq(1);
    });

    it("should revert if nonce is not valid", async () => {
      const nonSignedOp = await getDefaultPackedUserOperation(account, paymaster);
      nonSignedOp.nonce = ethers.MaxUint256 - 2n;
      const signedOp = await getSignedPackedUserOperation(entryPoint, privateKey, EVENT_ID, nonSignedOp);

      await expect(sendSignedPackedUserOperation(entryPoint, signedOp))
        .to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert")
        .withArgs(0, "AA23 reverted", "0xb1373a6cfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd");
    });

    it("should revert if trying to validate User Operation not from entrypoint", async () => {
      const nonSignedOp = await getDefaultPackedUserOperation(account, paymaster);

      await expect(account.validateUserOp(nonSignedOp, ethers.ZeroHash, 0n))
        .to.be.revertedWithCustomError(account, "NotFromEntryPoint")
        .withArgs(OWNER.address);
    });

    it("should not pay back if missing funds is zero", async () => {
      await impersonateAccount(await entryPoint.getAddress());
      const entryPointAsSigner = await ethers.provider.getSigner(await entryPoint.getAddress());
      await setBalance(await entryPoint.getAddress(), ethers.parseEther("20"));

      const nonSignedOp = await getDefaultPackedUserOperation(account, paymaster);
      const signedOp = await getSignedPackedUserOperation(entryPoint, privateKey, EVENT_ID, nonSignedOp);
      const hashOp = await entryPoint.getUserOpHash(signedOp);

      expect(await account.connect(entryPointAsSigner).validateUserOp.staticCall(signedOp, hashOp, 0n)).to.be.eq(0n);

      await expect(account.connect(entryPointAsSigner).validateUserOp(signedOp, hashOp, 0n)).to.be.fulfilled;
    });

    it("should support relevant interfaces", async () => {
      expect(await account.supportsInterface(await getInterfaceID("IAccount"))).to.be.true;
      expect(await account.supportsInterface(await getInterfaceID("IERC165"))).to.be.true;
    });

    it("should upgrade Smart Account implementation only by owner", async () => {
      const currentImplementation = await account.implementation();

      const SmartAccount = await ethers.getContractFactory("SmartAccount");
      const newImplementation = await SmartAccount.deploy(ethers.ZeroAddress, ethers.ZeroAddress);

      await account.setSessionAccount(OWNER.address, await getSignature(privateKey, EVENT_ID, OWNER.address));

      await expect(account.connect(SECOND).upgradeToAndCall(await newImplementation.getAddress(), "0x"))
        .to.be.revertedWithCustomError(account, "NotFromThis")
        .withArgs(SECOND.address);

      await account.execute(
        await account.getAddress(),
        0n,
        account.interface.encodeFunctionData("upgradeToAndCall", [await newImplementation.getAddress(), "0x"]),
      );

      expect(await account.implementation()).to.eq(await newImplementation.getAddress());
      expect(await account.implementation()).to.not.eq(currentImplementation);
    });

    it("should revert if trying to initialize factory twice", async () => {
      await expect(account.__SmartAccount_init(ethers.ZeroHash)).to.be.revertedWithCustomError(
        account,
        "InvalidInitialization",
      );
    });
  });
});
