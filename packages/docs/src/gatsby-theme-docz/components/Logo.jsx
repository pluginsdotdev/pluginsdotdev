import * as React from "react";
import { Link } from "docz";

export const Logo = ({ small, ...props }) => (
  <Link to="/">
    <img alt="plugins.dev logo" height="60px" width="273px" {...props} src="/public/logo.png" />
  </Link>
);
