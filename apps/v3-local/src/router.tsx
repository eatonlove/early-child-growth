import {
  Children,
  createContext,
  isValidElement,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface RouterState {
  pathname: string;
  search: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterState | null>(null);

function currentLocation() {
  return { pathname: window.location.pathname || "/", search: window.location.search };
}

export function BrowserRouter({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(currentLocation);

  useEffect(() => {
    const handlePopState = () => setLocation(currentLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const value = useMemo<RouterState>(() => ({
    ...location,
    navigate: (to, options) => {
      const url = new URL(to, window.location.origin);
      if (options?.replace) window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      else window.history.pushState(null, "", `${url.pathname}${url.search}`);
      setLocation({ pathname: url.pathname, search: url.search });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  }), [location]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter() {
  const router = useContext(RouterContext);
  if (!router) throw new Error("Router components must be used inside BrowserRouter");
  return router;
}

export function useLocation() {
  const { pathname, search } = useRouter();
  return { pathname, search };
}

export function useNavigate() {
  return useRouter().navigate;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export function Link({ to, onClick, children, ...props }: LinkProps) {
  const navigate = useNavigate();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handleClick} {...props}>{children}</a>;
}

interface NavLinkProps extends Omit<LinkProps, "className"> {
  className?: string | ((state: { isActive: boolean }) => string);
}

export function NavLink({ to, className, ...props }: NavLinkProps) {
  const { pathname } = useLocation();
  const isActive = pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
  const resolvedClassName = typeof className === "function" ? className({ isActive }) : className ?? (isActive ? "active" : "");
  return <Link to={to} className={resolvedClassName} aria-current={isActive ? "page" : undefined} {...props} />;
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace }), [navigate, replace, to]);
  return null;
}

interface RouteProps {
  path: string;
  element: ReactElement;
}

export function Route(_props: RouteProps) {
  return null;
}

export function Routes({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const routes = Children.toArray(children).filter(isValidElement) as ReactElement<RouteProps>[];
  const match = routes.find((route) => route.props.path === pathname)
    ?? routes.find((route) => route.props.path === "*");
  return match?.props.element ?? null;
}
