/** @jsx jsx */
import { jsx, useColorMode } from 'theme-ui'
import { Link } from "docz";
import { media } from '~theme/breakpoints';

export const Logo = ({ small, ...props }) => {
  const [colorMode] = useColorMode();
  return (
    <Link to="/">
      <img sx={{display: "block", [media.mobile]: {display: "none"}}} alt="plugins.dev logo" height="60px" width="273px" {...props} src={colorMode === "light" ? "/public/logo.png" : "/public/logo-dark.png"} />
      <img sx={{display: "none", [media.mobile]: {display: "block"}}} alt="plugins.dev logo" height="60px" width="60px" {...props} src="/public/logo-small.png" />
    </Link>
  )
};
