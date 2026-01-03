package org.ivan.backend.backend.BD;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

public class DINAMYT {
    static String url ="jdbc:mysql://localhost:3306/dinamyt";
    static String user ="root";
    static String pass ="";
    public static Connection conexion(){
        Connection con =null;
        try{
            con = DriverManager.getConnection(url, user, pass);
            System.out.println("Conectado a la BD");
        }catch(SQLException e){
            e.printStackTrace();
        }
        return con;
    }
}
