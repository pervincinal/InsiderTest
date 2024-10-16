package managers;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

public class DriverManager {

    private static WebDriver driver;

    public static WebDriver initializeDriver(String browser) {
        if (driver == null) {
            if (browser.equalsIgnoreCase("chrome")) {
                driver = createDriverFromChrome();
            } else if (browser.equalsIgnoreCase("firefox")) {
                driver = createDriverFromFirefox();
            }
            assert driver != null;
            driverManageConfig(driver);
        }
        return driver;
    }

    public static void quitDriver() {
        if (driver != null) {
            driver.quit();
            driver = null;
        }
    }

    public static WebDriver getDriver() {
        return driver;
    }

    private static WebDriver createDriverFromChrome() {
        ChromeOptions options = createChromeOptions();
        return new ChromeDriver(options);
    }

    private static WebDriver createDriverFromFirefox() {
        FirefoxOptions options = createFirefoxOptions();
        return new FirefoxDriver(options);
    }

    private static ChromeOptions createChromeOptions() {
        ChromeOptions options = new ChromeOptions();
        Map<String, Object> chromePrefs = new HashMap<>();
        chromePrefs.put("profile.default_content_settings.popups", 0);
        options.addArguments(
                "--headless",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-notifications",
                "--remote-allow-origins=*",
                "--window-size=1440,900");
        return options;
    }

    private static FirefoxOptions createFirefoxOptions() {
        FirefoxOptions options = new FirefoxOptions();
        options.addArguments("--headless");
        options.addArguments("--window-size=1440,900");
        return options;
    }

    private static void driverManageConfig(WebDriver driver) {
        int IMPLICIT_WAIT_SECONDS = 10;
        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(IMPLICIT_WAIT_SECONDS));
        driver.manage().window().maximize();
    }

}