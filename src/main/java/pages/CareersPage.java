package pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;

public class CareersPage {

    @FindBy(css = "div[class='col-12 d-flex flex-wrap']")
    public WebElement locations;

    @FindBy(css = "section[data-id='a8e7b90']")
    public WebElement lifeAtInsider;

    public CareersPage(WebDriver driver) {
        PageFactory.initElements(driver, this);
    }
}
