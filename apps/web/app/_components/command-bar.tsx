import { ConnectWalletButton } from "./connect-wallet-button";
import { HeaderNavLink, HeaderShell, NetworkTag } from "./header";

export function CommandBar() {
  return (
    <HeaderShell>
      <NetworkTag />
      <HeaderNavLink href="/simulator" className="hidden sm:inline-flex">
        Simulator
      </HeaderNavLink>
      <ConnectWalletButton className="btn btn-accent btn-sm" />
    </HeaderShell>
  );
}
