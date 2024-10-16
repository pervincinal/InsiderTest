package actions;

import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;

import static managers.DriverManager.getDriver;

public class HoverToElementAction {

    public static void hoverToElement(WebElement element) {
        Actions actions = new Actions(getDriver());
        try {
            actions.moveToElement(element).perform();
        } catch (IllegalAccessError exception) {
            throw new RuntimeException(exception);
        }
    }

}