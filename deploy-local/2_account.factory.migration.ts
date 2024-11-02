import { Deployer, Reporter } from "@solarity/hardhat-migrate";

import {
  EntryPoint__factory,
  ERC1967Proxy__factory,
  IdentityAuthVerifier__factory,
  SmartAccount__factory,
  SmartAccountFactory__factory,
} from "@ethers-v6";

export = async (deployer: Deployer) => {
  const entryPoint = await deployer.deployed(EntryPoint__factory);

  let accountFactory = await deployer.deploy(SmartAccountFactory__factory);
  const proxy = await deployer.deploy(ERC1967Proxy__factory, [await accountFactory.getAddress(), "0x"], {
    name: "SmartAccountFactoryProxy",
  });
  accountFactory = await deployer.deployed(SmartAccountFactory__factory, await proxy.getAddress());

  const identityAuthVerifier = await deployer.deploy(IdentityAuthVerifier__factory);

  const accountImplementation = await deployer.deploy(SmartAccount__factory, [
    await entryPoint.getAddress(),
    await identityAuthVerifier.getAddress(),
  ]);

  await accountFactory.__SmartAccountFactory_init(await accountImplementation.getAddress());

  Reporter.reportContracts(["SmartAccountFactory", await accountFactory.getAddress()]);
};
