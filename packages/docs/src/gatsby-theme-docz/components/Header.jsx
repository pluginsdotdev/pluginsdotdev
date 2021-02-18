/** @jsx jsx */
import { jsx, Box, Flex, useColorMode } from 'theme-ui'
import { useConfig } from 'docz'

import * as styles from 'gatsby-theme-docz/src/components/Header/styles'
import { Menu, Sun } from 'gatsby-theme-docz/src/components/Icons'
import ExternalLink from 'react-feather/dist/icons/external-link'
import { Logo } from './Logo'

export const Header = props => {
  const { onOpen } = props
  const {
    themeConfig: { showDarkModeSwitch },
  } = useConfig()
  const [colorMode, setColorMode] = useColorMode()

  const toggleColorMode = () => {
    setColorMode(colorMode === 'light' ? 'dark' : 'light')
  }

  return (
    <div sx={styles.wrapper} data-testid="header">
      <Box sx={styles.menuIcon}>
        <button sx={styles.menuButton} onClick={onOpen}>
          <Menu size={25} />
        </button>
      </Box>
      <div sx={styles.innerContainer}>
        <Logo />
        <Flex>
          <Box sx={{ mr: 2 }}>
            <a
              href="https://plugins.dev"
              sx={{...styles.headerButton, bg: "none", color: "header.text", textDecoration: "none"}}
              target="_blank"
              rel="noopener noreferrer"
            >
              Host sign up&nbsp;<ExternalLink size={15} />
            </a>
          </Box>
          <Box sx={{ mr: 2 }}>
            <a
              href="https://plugins.dev/authors"
              sx={{...styles.headerButton, bg: "none", color: "header.text", textDecoration: "none"}}
              target="_blank"
              rel="noopener noreferrer"
            >
              Author sign up&nbsp;<ExternalLink size={15} />
            </a>
          </Box>
          {showDarkModeSwitch && (
            <button
              sx={styles.headerButton}
              onClick={toggleColorMode}
              aria-label={`Switch to ${colorMode} mode`}
            >
              <Sun size={15} />
            </button>
          )}
        </Flex>
      </div>
    </div>
  )
}
