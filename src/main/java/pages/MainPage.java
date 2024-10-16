package pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;
import org.openqa.selenium.support.PageFactory;

public class MainPage {

    @FindBy(css = "img[alt='insider_logo']")
    public WebElement logo;

    public MainPage(WebDriver driver) {
        PageFactory.initElements(driver, this);
    }
}
