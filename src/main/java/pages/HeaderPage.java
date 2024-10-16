package pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;

public class HeaderPage {

    @FindBy(xpath = "//li[@class='nav-item dropdown'][.//img[contains(@src, 'runs')]]")
    public WebElement company;

    @FindBy(xpath = "//a[@href='https://useinsider.com/careers/']")
    public WebElement career;

    public HeaderPage(WebDriver driver) {
        PageFactory.initElements(driver, this);
    }

}