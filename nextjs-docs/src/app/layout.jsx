import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Banner, Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
 
export const metadata = {
  title: 'F1 Racing Encyclopedia',
  description: 'Complete Formula 1 racing documentation - Teams, drivers, circuits, history, and more',
}
 
const banner = <Banner storageKey="f1-banner">🏁 Welcome to F1 Racing Encyclopedia</Banner>
const navbar = (
  <Navbar
    logo={<><strong>F1</strong> <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>Racing</span></>}
    projectLink="https://github.com/vaishnav-mk/mintlify-cache-sim"
  />
)
const footer = <Footer>Formula 1 Encyclopedia {new Date().getFullYear()} © All Rights Reserved.</Footer>
 
export default async function RootLayout({ children }) {
  return (
    <html
      // Not required, but good for SEO
      lang="en"
      // Required to be set
      dir="ltr"
      // Suggested by `next-themes` package https://github.com/pacocoursey/next-themes#with-app
      suppressHydrationWarning
    >
      <Head
      // ... Your additional head options
      >
        {/* Your additional tags should be passed as `children` of `<Head>` element */}
      </Head>
      <body>
        <Layout
          banner={banner}
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/vaishnav-mk/mintlify-cache-sim"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}