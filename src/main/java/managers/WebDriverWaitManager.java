package managers;

import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

import static managers.DriverManager.getDriver;

public class WebDriverWaitManager {

    private static WebDriverWait wait;

    public static void setDriverForSynchronization() {
        wait = new WebDriverWait(getDriver(), Duration.ofSeconds(10));
    }

    public static void waitForElementClickable(WebElement element) {
        wait.until(ExpectedConditions.elementToBeClickable(element));
    }

    public static void waitForElementVisibility(WebElement element) {
        wait.until(ExpectedConditions.visibilityOf(element));
    }

    public static void waitForUrl(String url) {
        wait.until(ExpectedConditions.urlToBe(url));
    }

}