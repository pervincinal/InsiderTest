package actions;

import org.openqa.selenium.WebElement;

import static managers.WebDriverWaitManager.waitForElementClickable;
import static managers.WebDriverWaitManager.waitForElementVisibility;

public class ClickToElementAction {

    public static void click(WebElement element) {
        try {
            waitForElementVisibility(element);
            waitForElementClickable(element);
            element.click();
        } catch (IllegalAccessError error) {
            throw new RuntimeException(error);
        }
    }

}