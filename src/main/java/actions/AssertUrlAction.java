package actions;

import org.testng.Assert;

import static managers.DriverManager.getDriver;

public class AssertUrlAction {

    public static void assertCurrentUrl(String expectedUrl) {
        try {
            Assert.assertEquals(getDriver().getCurrentUrl(), expectedUrl);
        } catch (AssertionError error) {
            throw new RuntimeException(error);
        }
    }

}