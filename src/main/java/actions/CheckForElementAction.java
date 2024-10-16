package actions;

import org.openqa.selenium.WebElement;

public class CheckForElementAction {

    public static void checkElementIfDisplayed(WebElement element) {
        try {
            if (element.isDisplayed()) {
                if (!element.isEnabled()) {
                    throw new RuntimeException("Element is displayed but not clickable.");
                }
            } else {
                throw new RuntimeException("Element is not displayed.");
            }
        } catch (Exception exception) {
            throw new RuntimeException("Error checking element for display and clickability:");
        }
    }

}